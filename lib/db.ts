/**
 * The application's data store. SERVER ONLY.
 *
 * This is the persistence boundary and the only thing above it that anything
 * imports. Product code -- pages, route handlers, `lib/events.ts`,
 * `lib/session.ts` -- talks to `db` and knows nothing about SQL Server, the
 * driver, or how an event is spread over three tables.
 *
 *   Server Component / Route Handler -> lib/db.ts -> lib/data/* -> mssql -> SQL Server
 *
 * It holds no T-SQL of its own. Every statement lives under `lib/data/`, which
 * is a scan root of `npm run check:tsql` -- so the SQL this application writes
 * is held to the SQL Server 2008 R2 feature floor and to the rule that it may
 * only ever touch `Events_*` tables. SQL written here would be unguarded.
 *
 * What this file still owns is the part that is not persistence: **the
 * application generates every id and every timestamp.** Nothing is defaulted by
 * the database and no server clock is read, so a record's identity and its
 * stamps are decided in one place that is easy to find.
 *
 * The contract is the in-memory store's, with one deliberate exception noted
 * below. Every method is async; a missing row is `null` and a failed delete is
 * `false`; ids and `createdAt` are immutable; `updatedAt` is refreshed by the
 * store and never by the caller. Reads return fresh objects, so a caller
 * mutating what it got back cannot corrupt anything -- the deep-copy promise
 * the old store made with `structuredClone`, kept for free now that every read
 * builds new objects.
 *
 * One rule is easy to break and worth repeating here, because it is a product
 * bug rather than a type error: in a patch, a key that is **present with the
 * value `undefined`** clears the field, and a key that is **absent** leaves it
 * alone. See `assignPatch` in `lib/data/registrations.ts`.
 *
 * **The exception, and the reason for it.** `registrations.claimSeat` and
 * `registrations.approve` are not plain persistence: they are the only two
 * writes that may give somebody a confirmed place, because "the `going` count
 * never exceeds capacity" is an invariant no constraint can express and only a
 * transaction can hold. See `lib/data/seats.ts` for the protocol.
 *
 * `registrations.create` is gone for the same reason. An unconditional insert
 * took no lock and checked no capacity, so a `going` row written through it
 * would have put an event over its limit with nothing to catch it -- and an
 * unused method on this object is an invitation to do exactly that. The store
 * now offers no way to create a registration except the safe one. Everything
 * else here remains one statement against one table.
 *
 * `registrations.update` is held to the same line by its patch type rather than
 * by a comment: `RegistrationUpdate` admits no `status: "going"`, and no
 * `eventId` or `userId` either, so the generic write can neither hand out a
 * place nor move one to another event or another person. `lib/data/seats.ts`
 * keeps the full `RegistrationPatch` because granting a place under the lock is
 * its job.
 *
 * Most updates also take an expected status, which makes the write conditional
 * on the row still being in the state the caller decided against. A `null`
 * return means it was not, which is a conflict rather than a missing row --
 * callers already report both the same way.
 *
 * Never import this from a Client Component. Client code talks to API routes.
 */

import {
  createEvent,
  getEvent,
  listEvents,
  removeEvent,
  updateEvent,
} from "./data/events";
import {
  findRegistration,
  getRegistration,
  listRegistrations,
  removeRegistration,
  updateRegistration,
} from "./data/registrations";
import {
  approveRequest,
  claimSeat,
  type SeatApproval,
  type SeatClaim,
} from "./data/seats";
import { getUser, listUsers } from "./data/users";
import type {
  EventRecord,
  EventStatus,
  Registration,
  RegistrationStatus,
  User,
} from "./types";

export type EventInput = Omit<EventRecord, "id" | "createdAt" | "updatedAt">;
export type EventPatch = Partial<EventInput>;

/**
 * Every field of a registration a write may touch. **`lib/data/` only.**
 *
 * The full surface, including `status: "going"`, because `lib/data/seats.ts`
 * legitimately needs it: granting a place is exactly what that module is for,
 * and it does it under the event-row lock. See `RegistrationUpdate` below for
 * what the store hands to product code, which is a good deal less.
 */
export type RegistrationPatch = Partial<Omit<Registration, "id" | "createdAt">>;

/**
 * What `registrations.update` accepts -- and the three things it does not.
 *
 * `status: "going"` is absent because raising the `going` count is the one
 * write this store will not perform generically. `claimSeat` and `approve`
 * exist for it and take the event-row lock first; a third way in would put an
 * event over its capacity with nothing to catch it, since no constraint can
 * express that rule (`lib/data/seats.ts` explains why). The file already warned
 * about this in prose -- *"a future write path that sets `Status = N'going'`
 * without coming through here silently breaks the invariant"* -- and this is
 * the same warning where the compiler can read it.
 *
 * `eventId` and `userId` are absent because they are not a patch at all. Moving
 * a row to another event is re-parenting it past every capacity check both
 * events ever ran, and moving it to another person hands somebody else's place
 * away. Neither is something the product does, and both were expressible.
 *
 * `updatedAt` stays permitted and stays ignored, as it always has been -- the
 * stamp is the store's to apply. See `assignPatch` in
 * `lib/data/registrations.ts`.
 *
 * Nothing here is a runtime check: the two real callers write `cancelled` and
 * `rejected` and are unaffected. It is the invariant made structural, so the
 * next caller cannot be the one that breaks it.
 *
 * **`eventId?: never` rather than simply leaving the keys out**, and the
 * difference is the whole value of the type. Omitting them is only enforced
 * against an object literal, because TypeScript lets a *variable* carry
 * properties its target does not declare -- so `update(id, patch)` with a
 * `patch` built elsewhere would have slipped both through, which is exactly the
 * shape a future caller would write. `never` makes the key itself
 * unsatisfiable, so there is no way to hold a value of this type that has one.
 */
export type RegistrationUpdate = Partial<
  Omit<Registration, "id" | "eventId" | "userId" | "createdAt" | "status">
> & {
  status?: Exclude<RegistrationStatus, "going">;
  eventId?: never;
  userId?: never;
};

/**
 * A new persistent entity id.
 *
 * A whole UUID, not a shortened one. The value is opaque: nothing in the app may
 * read anything from the shape of an id, so there is no prefix naming the kind
 * of record it belongs to and nothing is truncated to keep it readable. The
 * fixtures follow the same rule with fixed literals -- see `lib/seed.ts`.
 *
 * Generated here rather than by the database. The columns carry no
 * `DEFAULT NEWID()` precisely so that a write which forgot to supply one fails
 * instead of quietly storing a row under an id the application never learns.
 */
function newId(): string {
  return crypto.randomUUID();
}

/** The application supplies every timestamp; no statement reads a server clock. */
function now(): string {
  return new Date().toISOString();
}

export const db = {
  users: {
    async list(): Promise<User[]> {
      return listUsers();
    },

    async get(id: string): Promise<User | null> {
      return getUser(id);
    },
  },

  events: {
    async list(): Promise<EventRecord[]> {
      return listEvents();
    },

    async get(id: string): Promise<EventRecord | null> {
      return getEvent(id);
    },

    async create(input: EventInput): Promise<EventRecord> {
      const timestamp = now();
      const record: EventRecord = {
        ...input,
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await createEvent(record);

      // The record as written. `datetime2(3)` is exactly millisecond precision,
      // so re-reading it would return these same values at the cost of a round
      // trip.
      return record;
    },

    /**
     * `expectedStatus` makes the write conditional on the row still being in
     * the status the caller decided against -- publish uses it so two requests
     * cannot both publish one draft. Omitted, the update is unconditional and
     * content edits stay last-write-wins.
     */
    async update(
      id: string,
      patch: EventPatch,
      expectedStatus?: EventStatus,
    ): Promise<EventRecord | null> {
      return updateEvent(id, patch, now(), expectedStatus);
    },

    /**
     * Deletes the event and every registration attached to it. Orphaned
     * registrations would otherwise show up in "my events" forever.
     */
    async remove(id: string): Promise<boolean> {
      return removeEvent(id);
    },
  },

  registrations: {
    /** All registrations, optionally narrowed by event and/or user. */
    async list(filter?: {
      eventId?: string;
      userId?: string;
    }): Promise<Registration[]> {
      return listRegistrations(filter);
    },

    /**
     * One registration by its own id, whoever it belongs to.
     *
     * For the two routes that are handed a `registrationId` in the URL: a host
     * deciding somebody else's request knows the row's id and not the pair that
     * identifies it. **Whether that row is one this caller may decide is not
     * answered here** -- it is a plain lookup, and both routes check
     * `eventId` against the event they already authorised before doing
     * anything with what comes back.
     *
     * Looking a row up rather than scanning the event's rows for a matching id
     * is also what makes the id's case the database's business instead of a
     * route's -- see `getRegistration` in `lib/data/registrations.ts`.
     */
    async get(id: string): Promise<Registration | null> {
      return getRegistration(id);
    },

    /** A person has at most one registration per event. */
    async find(eventId: string, userId: string): Promise<Registration | null> {
      return findRegistration(eventId, userId);
    },

    /**
     * `expectedStatus` makes this a compare-and-set: the row is written only if
     * it is still in the status the caller's decision was based on. Every state
     * transition passes it -- withdrawing, rejecting, reviving -- so two writers
     * deciding the same row cannot both win. A `null` return then means the row
     * moved, which routes report as a conflict.
     *
     * It cannot grant a place, and it cannot move a row to another event or
     * another person -- `RegistrationUpdate` does not admit any of the three.
     * Withdrawing and rejecting are what remain, and neither can raise the
     * `going` count, which is why neither needs the event lock.
     */
    async update(
      id: string,
      patch: RegistrationUpdate,
      expectedStatus?: RegistrationStatus,
    ): Promise<Registration | null> {
      return updateRegistration(id, patch, now(), expectedStatus);
    },

    async remove(id: string): Promise<boolean> {
      return removeRegistration(id);
    },

    /**
     * Take a place at an event, or request one, without a capacity race.
     *
     * The only write in this store that is not a single statement on one table,
     * and the reason is in `lib/data/seats.ts`: it locks the event row, re-reads
     * the count and the caller's row under that lock, re-runs the same rule from
     * `lib/permissions.ts` the route already ran, and only then writes. The
     * `SeatClaim` it returns says which of those answers came back.
     *
     * The id and both timestamps are still generated here, as they are for
     * every other record.
     */
    async claimSeat(eventId: string, viewer: User): Promise<SeatClaim> {
      return claimSeat({ eventId, viewer, newId: newId(), now: now() });
    },

    /** The host's half of the same protocol: `pending`/`rejected` -> `going`. */
    async approve(
      eventId: string,
      registrationId: string,
      decidedBy: string,
    ): Promise<SeatApproval> {
      return approveRequest({
        eventId,
        registrationId,
        decidedBy,
        now: now(),
      });
    },
  },
};

export type { SeatApproval, SeatClaim };
