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
 * The contract is unchanged from the in-memory store this replaced. Every
 * method is async; a missing row is `null` and a failed delete is `false`; ids
 * and `createdAt` are immutable; `updatedAt` is refreshed by the store and
 * never by the caller. Reads return fresh objects, so a caller mutating what it
 * got back cannot corrupt anything -- the deep-copy promise the old store made
 * with `structuredClone`, kept for free now that every read builds new objects.
 *
 * One rule is easy to break and worth repeating here, because it is a product
 * bug rather than a type error: in a patch, a key that is **present with the
 * value `undefined`** clears the field, and a key that is **absent** leaves it
 * alone. See `assignPatch` in `lib/data/registrations.ts`.
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
  createRegistration,
  findRegistration,
  listRegistrations,
  removeRegistration,
  updateRegistration,
} from "./data/registrations";
import { getUser, listUsers } from "./data/users";
import type { EventRecord, Registration, User } from "./types";

export type EventInput = Omit<EventRecord, "id" | "createdAt" | "updatedAt">;
export type EventPatch = Partial<EventInput>;

export type RegistrationInput = Omit<
  Registration,
  "id" | "createdAt" | "updatedAt"
>;
export type RegistrationPatch = Partial<Omit<Registration, "id" | "createdAt">>;

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

    async update(id: string, patch: EventPatch): Promise<EventRecord | null> {
      return updateEvent(id, patch, now());
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

    /** A person has at most one registration per event. */
    async find(eventId: string, userId: string): Promise<Registration | null> {
      return findRegistration(eventId, userId);
    },

    async create(input: RegistrationInput): Promise<Registration> {
      const timestamp = now();
      const record: Registration = {
        ...input,
        id: newId(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };

      await createRegistration(record);

      return record;
    },

    async update(
      id: string,
      patch: RegistrationPatch,
    ): Promise<Registration | null> {
      return updateRegistration(id, patch, now());
    },

    async remove(id: string): Promise<boolean> {
      return removeRegistration(id);
    },
  },
};
