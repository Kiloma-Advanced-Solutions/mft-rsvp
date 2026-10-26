/**
 * Event reads and writes. SERVER ONLY -- it reaches `client.ts`.
 *
 * An `EventRecord` is spread over three tables: the row itself, plus a co-host
 * and an invite row per member. Reads therefore fetch the base rows and the two
 * junction tables and stitch them together in memory -- a fixed number of
 * queries whether there is one event or a hundred, which is the same reason
 * `lib/events.ts` loads its three collections once instead of per event.
 *
 * Writes that touch more than one table run in a transaction, so an event never
 * exists without its co-hosts. Inviting and revoking change one person's invite
 * row at a time, under the event-row lock.
 *
 * **Deletion is soft.** Deleting an event stamps its `DeletedAt` and removes
 * nothing; its registrations, co-hosts and invitations stay in the database.
 * Every statement below that reads an event row filters on
 * `DeletedAt IS NULL`, so a deleted event is nonexistent to every read --
 * admins included -- and `DeletedAt` never reaches `EventRecord`. **A new event
 * read must carry the same filter**, or it leaks deleted events. The membership
 * reads that are not scoped to one event (`SELECT_COHOSTS`, `SELECT_INVITES`)
 * need none: their rows are only ever stitched onto events read here.
 */

import sql from "mssql";
import type { Transaction } from "mssql";

import { getPool, inTransaction, type Runner } from "./client";
import { isDuplicateKey } from "./errors";
import {
  groupByEvent,
  isUuid,
  toEvent,
  type EventRow,
  type MembershipRow,
} from "./rows";
import {
  getInvitationAvailability,
  getInvitationRevocationAvailability,
} from "../permissions";
import type {
  EventRecord,
  EventStatus,
  InvitationAvailability,
  InvitationRevocationAvailability,
  User,
} from "../types";
import type { EventPatch } from "../db";

/**
 * `StartsAt` first only so the order never changes between calls. Nothing
 * depends on it: `app/events/page.tsx` sorts and groups the board itself.
 */
const SELECT_EVENTS = `
SELECT Id, Title, Summary, Description, StartsAt, EndsAt,
       LocationKind, LocationVenue, LocationAddress, LocationUrl, LocationPlatform,
       Category, Accent, Capacity, Access, Status, OrganizerId, CreatedAt, UpdatedAt
FROM   dbo.Events_Events
WHERE  DeletedAt IS NULL
ORDER  BY StartsAt ASC, Id ASC;
`;

const SELECT_EVENT = `
SELECT Id, Title, Summary, Description, StartsAt, EndsAt,
       LocationKind, LocationVenue, LocationAddress, LocationUrl, LocationPlatform,
       Category, Accent, Capacity, Access, Status, OrganizerId, CreatedAt, UpdatedAt
FROM   dbo.Events_Events
WHERE  Id = @id AND DeletedAt IS NULL;
`;

/**
 * The same row, taken with an update lock. **This is the seat-claim mutex.**
 *
 * `UPDLOCK` is the load-bearing hint: an update lock is held until the
 * transaction commits and is incompatible with another update lock, so a second
 * transaction asking for this row waits here rather than reading a capacity
 * count that is about to be wrong. A plain `SELECT` would take a shared lock and
 * release it immediately, which is precisely the gap two registrations for the
 * final seat slip through.
 *
 * `ROWLOCK` is defensive rather than load-bearing: a seek on the primary key
 * already locks at row granularity, and the hint only discourages the optimizer
 * from taking something coarser. It is written because
 * `docs/sql-server-2008r2-compatibility.md` and
 * `scripts/tsql-fixtures/allowed.sql` both give the pair as this project's
 * idiom.
 *
 * No `HOLDLOCK`, and none is needed. A phantom `going` row cannot appear while
 * this lock is held, because every write that can create one takes this same
 * lock first -- see `lib/data/seats.ts`. The protection is the protocol, not a
 * range lock.
 */
const SELECT_EVENT_FOR_UPDATE = `
SELECT Id, Title, Summary, Description, StartsAt, EndsAt,
       LocationKind, LocationVenue, LocationAddress, LocationUrl, LocationPlatform,
       Category, Accent, Capacity, Access, Status, OrganizerId, CreatedAt, UpdatedAt
FROM   dbo.Events_Events WITH (UPDLOCK, ROWLOCK)
WHERE  Id = @id AND DeletedAt IS NULL;
`;

/**
 * The lock on its own, for a writer that needs the mutex but not the facts.
 *
 * `removeEvent` takes it before marking the event deleted, and the
 * registration transitions that cannot raise the count -- withdraw, reject,
 * remove -- take it before writing their row, through `lockEvent` below. That
 * is what keeps every transaction in this application acquiring locks in the
 * same order. An event already deleted is not locked and not found.
 */
const LOCK_EVENT = `
SELECT Id
FROM   dbo.Events_Events WITH (UPDLOCK, ROWLOCK)
WHERE  Id = @id AND DeletedAt IS NULL;
`;

const SELECT_COHOSTS = `
SELECT EventId, UserId
FROM   dbo.Events_EventCoHosts
ORDER  BY EventId ASC, UserId ASC;
`;

const SELECT_INVITES = `
SELECT EventId, UserId
FROM   dbo.Events_EventInvites
ORDER  BY EventId ASC, UserId ASC;
`;

const SELECT_COHOSTS_FOR_EVENT = `
SELECT EventId, UserId
FROM   dbo.Events_EventCoHosts
WHERE  EventId = @id
ORDER  BY UserId ASC;
`;

const SELECT_INVITES_FOR_EVENT = `
SELECT EventId, UserId
FROM   dbo.Events_EventInvites
WHERE  EventId = @id
ORDER  BY UserId ASC;
`;

const INSERT_EVENT = `
INSERT INTO dbo.Events_Events
    (Id, Title, Summary, Description, StartsAt, EndsAt, LocationKind,
     LocationVenue, LocationAddress, LocationUrl, LocationPlatform,
     Category, Accent, Capacity, Access, Status, OrganizerId,
     CreatedAt, UpdatedAt)
VALUES
    (@id, @title, @summary, @description, @startsAt, @endsAt, @locationKind,
     @locationVenue, @locationAddress, @locationUrl, @locationPlatform,
     @category, @accent, @capacity, @access, @status, @organizerId,
     @createdAt, @updatedAt);
`;

const INSERT_COHOST = `
INSERT INTO dbo.Events_EventCoHosts (EventId, UserId)
VALUES (@eventId, @userId);
`;

const INSERT_INVITE = `
INSERT INTO dbo.Events_EventInvites (EventId, UserId)
VALUES (@eventId, @userId);
`;

const DELETE_COHOSTS_FOR_EVENT = `
DELETE FROM dbo.Events_EventCoHosts
WHERE  EventId = @id;
`;

const DELETE_INVITES_FOR_EVENT = `
DELETE FROM dbo.Events_EventInvites
WHERE  EventId = @id;
`;

/** One person's invitation, by the table's own key. */
const DELETE_INVITE = `
DELETE FROM dbo.Events_EventInvites
WHERE  EventId = @eventId AND UserId = @userId;
`;

/**
 * Soft deletion. The row stays and is stamped; `DeletedAt IS NULL` in the
 * predicate makes a second delete affect nothing. `@now` is bound by the
 * application -- no statement here reads a server clock.
 */
const SOFT_DELETE_EVENT = `
UPDATE dbo.Events_Events
SET    DeletedAt = @now, UpdatedAt = @now
WHERE  Id = @id AND DeletedAt IS NULL;
`;

/* -------------------------------------------------------------------- reads */

export async function listEvents(): Promise<EventRecord[]> {
  const pool = await getPool();

  // Three queries for any number of events. Issued together because none of
  // them depends on another's result.
  const [events, coHosts, invites] = await Promise.all([
    pool.request().query<EventRow>(SELECT_EVENTS),
    pool.request().query<MembershipRow>(SELECT_COHOSTS),
    pool.request().query<MembershipRow>(SELECT_INVITES),
  ]);

  const coHostsByEvent = groupByEvent(coHosts.recordset);
  const invitesByEvent = groupByEvent(invites.recordset);

  return events.recordset.map((row) =>
    toEvent(
      row,
      coHostsByEvent.get(row.Id.toLowerCase()) ?? [],
      invitesByEvent.get(row.Id.toLowerCase()) ?? [],
    ),
  );
}

/**
 * One event, reassembled. Takes a runner so `updateEvent` can read its own
 * uncommitted write back through the same transaction.
 *
 * The three queries run **one after another, not in parallel**, and that is not
 * an oversight. A `Transaction` owns a single dedicated connection, so issuing
 * concurrent requests on one fails with `There is another request in progress`.
 * `listEvents` can use `Promise.all` because it only ever runs on the pool,
 * where every request gets its own connection; this cannot, because half its
 * callers hand it a transaction.
 */
async function readEvent(
  runner: Runner,
  id: string,
  statement: string = SELECT_EVENT,
): Promise<EventRecord | null> {
  const events = await runner
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<EventRow>(statement);

  const row = events.recordset[0];
  if (row === undefined) return null;

  const coHosts = await runner
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<MembershipRow>(SELECT_COHOSTS_FOR_EVENT);

  const invites = await runner
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<MembershipRow>(SELECT_INVITES_FOR_EVENT);

  return toEvent(
    row,
    coHosts.recordset.map((member) => member.UserId.toLowerCase()),
    invites.recordset.map((member) => member.UserId.toLowerCase()),
  );
}

export async function getEvent(id: string): Promise<EventRecord | null> {
  // A malformed id is "no such event", not an error -- the id arrives from a
  // URL segment and the store used to answer this with a plain `null`.
  if (!isUuid(id)) return null;

  return readEvent(await getPool(), id);
}

/**
 * The event, read inside `transaction` with the seat-claim lock held.
 *
 * The first statement it issues is the lock, so every caller is holding the
 * mutex before it reads a capacity or a count. Returns `null` if the event is
 * gone, which inside a transaction means it was deleted by whoever held the
 * lock before us -- a real answer, not an error.
 *
 * Exported for `lib/data/seats.ts` alone. Outside this file the only other
 * event-row lock is `lockEvent`, taken by the registration transitions in
 * `registrations.ts`; a further caller is a sign the protocol is being
 * reinvented somewhere it should not be. Inside it, `removeEvent` and the two
 * invitation writes take the same lock through the private statements, for
 * lock order rather than for capacity.
 */
export async function readEventForUpdate(
  transaction: Transaction,
  id: string,
): Promise<EventRecord | null> {
  if (!isUuid(id)) return null;

  return readEvent(transaction, id, SELECT_EVENT_FOR_UPDATE);
}

/**
 * Take the event-row lock inside `transaction`, without reading the event.
 * `false` if there is no live event to lock -- missing, or soft-deleted.
 *
 * The same `UPDLOCK` as the seat claim, held until the transaction ends, so a
 * soft delete -- which takes this lock too -- cannot commit between this and
 * the caller's write: whichever transaction locks the row first is ordered
 * first. For writers that need the lock but not the facts: `removeEvent`
 * here, and `transitionRegistration` in `registrations.ts`.
 */
export async function lockEvent(
  transaction: Transaction,
  id: string,
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const locked = await transaction
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<{ Id: string }>(LOCK_EVENT);

  return locked.recordset[0] !== undefined;
}

/* ------------------------------------------------------------------- writes */

/** Binds every column of an event row from a complete record. */
function bindEvent(
  request: sql.Request,
  record: EventRecord,
): sql.Request {
  return request
    .input("id", sql.UniqueIdentifier, record.id)
    .input("title", sql.NVarChar(sql.MAX), record.title)
    .input("summary", sql.NVarChar(sql.MAX), record.summary)
    .input("description", sql.NVarChar(sql.MAX), record.description)
    .input("startsAt", sql.DateTime2(3), new Date(record.startsAt))
    .input("endsAt", sql.DateTime2(3), new Date(record.endsAt))
    .input("locationKind", sql.NVarChar(16), record.location.kind)
    .input("locationVenue", sql.NVarChar(sql.MAX), record.location.venue ?? null)
    .input("locationAddress", sql.NVarChar(sql.MAX), record.location.address ?? null)
    .input("locationUrl", sql.NVarChar(sql.MAX), record.location.url ?? null)
    .input("locationPlatform", sql.NVarChar(sql.MAX), record.location.platform ?? null)
    .input("category", sql.NVarChar(16), record.category)
    .input("accent", sql.NVarChar(16), record.accent)
    .input("capacity", sql.Int, record.capacity)
    .input("access", sql.NVarChar(16), record.access)
    .input("status", sql.NVarChar(16), record.status)
    .input("organizerId", sql.UniqueIdentifier, record.organizerId)
    .input("createdAt", sql.DateTime2(3), new Date(record.createdAt))
    .input("updatedAt", sql.DateTime2(3), new Date(record.updatedAt));
}

/** Writes an event's co-host and invite rows. Assumes none exist yet. */
async function insertMembers(
  transaction: Transaction,
  eventId: string,
  coHostIds: string[],
  invitedUserIds: string[],
): Promise<void> {
  for (const userId of coHostIds) {
    await transaction
      .request()
      .input("eventId", sql.UniqueIdentifier, eventId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(INSERT_COHOST);
  }

  for (const userId of invitedUserIds) {
    await transaction
      .request()
      .input("eventId", sql.UniqueIdentifier, eventId)
      .input("userId", sql.UniqueIdentifier, userId)
      .query(INSERT_INVITE);
  }
}

/**
 * The event row and its members, together or not at all. The record is already
 * complete -- `lib/db.ts` generated the id and both timestamps.
 */
export async function createEvent(record: EventRecord): Promise<void> {
  const pool = await getPool();

  await inTransaction(pool, async (transaction) => {
    await bindEvent(transaction.request(), record).query(INSERT_EVENT);
    await insertMembers(
      transaction,
      record.id,
      record.coHostIds,
      record.invitedUserIds,
    );
  });
}

/**
 * Turns a patch into `SET` assignments.
 *
 * `Object.hasOwn`, not `value !== undefined`: a key that is present and
 * `undefined` means clear the field, a key that is absent means leave it. The
 * in-memory store got that distinction from `structuredClone` keeping
 * undefined-valued properties and the spread overwriting them. No current
 * caller sends an undefined here -- `parseEventForm` always produces all nine
 * content fields, and publish and cancel send only `status` -- but the
 * contract is the contract, and `registrations.ts` depends on the same rule
 * for real.
 *
 * `location` is replaced whole when present, which is what the shallow spread
 * did: all five columns are written, and a field the new kind does not use
 * becomes NULL rather than keeping the old value.
 */
function assignPatch(request: sql.Request, patch: EventPatch): string[] {
  const assignments: string[] = [];

  const set = (column: string, parameter: string) => {
    assignments.push(`${column} = @${parameter}`);
  };

  if (Object.hasOwn(patch, "title")) {
    request.input("title", sql.NVarChar(sql.MAX), patch.title ?? null);
    set("Title", "title");
  }
  if (Object.hasOwn(patch, "summary")) {
    request.input("summary", sql.NVarChar(sql.MAX), patch.summary ?? null);
    set("Summary", "summary");
  }
  if (Object.hasOwn(patch, "description")) {
    request.input("description", sql.NVarChar(sql.MAX), patch.description ?? null);
    set("Description", "description");
  }
  if (Object.hasOwn(patch, "startsAt")) {
    request.input(
      "startsAt",
      sql.DateTime2(3),
      patch.startsAt === undefined ? null : new Date(patch.startsAt),
    );
    set("StartsAt", "startsAt");
  }
  if (Object.hasOwn(patch, "endsAt")) {
    request.input(
      "endsAt",
      sql.DateTime2(3),
      patch.endsAt === undefined ? null : new Date(patch.endsAt),
    );
    set("EndsAt", "endsAt");
  }
  if (Object.hasOwn(patch, "location")) {
    const location = patch.location;
    request.input("locationKind", sql.NVarChar(16), location?.kind ?? null);
    request.input("locationVenue", sql.NVarChar(sql.MAX), location?.venue ?? null);
    request.input("locationAddress", sql.NVarChar(sql.MAX), location?.address ?? null);
    request.input("locationUrl", sql.NVarChar(sql.MAX), location?.url ?? null);
    request.input("locationPlatform", sql.NVarChar(sql.MAX), location?.platform ?? null);
    set("LocationKind", "locationKind");
    set("LocationVenue", "locationVenue");
    set("LocationAddress", "locationAddress");
    set("LocationUrl", "locationUrl");
    set("LocationPlatform", "locationPlatform");
  }
  if (Object.hasOwn(patch, "category")) {
    request.input("category", sql.NVarChar(16), patch.category ?? null);
    set("Category", "category");
  }
  if (Object.hasOwn(patch, "accent")) {
    request.input("accent", sql.NVarChar(16), patch.accent ?? null);
    set("Accent", "accent");
  }
  if (Object.hasOwn(patch, "capacity")) {
    // `null` is meaningful here: it is the domain value for unlimited.
    request.input("capacity", sql.Int, patch.capacity ?? null);
    set("Capacity", "capacity");
  }
  if (Object.hasOwn(patch, "access")) {
    request.input("access", sql.NVarChar(16), patch.access ?? null);
    set("Access", "access");
  }
  if (Object.hasOwn(patch, "status")) {
    request.input("status", sql.NVarChar(16), patch.status ?? null);
    set("Status", "status");
  }
  if (Object.hasOwn(patch, "organizerId")) {
    request.input("organizerId", sql.UniqueIdentifier, patch.organizerId ?? null);
    set("OrganizerId", "organizerId");
  }

  return assignments;
}

/**
 * Patch the row, replace the membership lists if the patch names them, and hand
 * back the event as it now stands.
 *
 * All in one transaction, so a caller never sees an event whose co-hosts have
 * been cleared but not rewritten. No current caller patches `coHostIds` or
 * `invitedUserIds` -- `parseEventForm` cannot produce them, and publish and
 * cancel send only `status` -- but `EventPatch` allows them, so they are
 * handled rather than quietly ignored.
 *
 * `expectedStatus` is compare-and-set, and the lifecycle transitions are what
 * want it: two requests that both read a draft must not both publish it, nor
 * two that both read a published event both cancel it. The second finds no row
 * in the expected status any more, affects nothing, and gets the `null` that
 * route handlers report as a conflict -- unless the event has since been
 * deleted, which also comes back `null` and which they report as a 404.
 *
 * Ordinary content edits pass no `expectedStatus` and stay last-write-wins,
 * which is what M4 decided and what Slice 8 deliberately does not revisit.
 */
export async function updateEvent(
  id: string,
  patch: EventPatch,
  updatedAt: string,
  expectedStatus?: EventStatus,
): Promise<EventRecord | null> {
  if (!isUuid(id)) return null;

  const pool = await getPool();

  return inTransaction(pool, async (transaction) => {
  const request = transaction.request();
    const assignments = assignPatch(request, patch);
    // Always present, so an empty patch still refreshes the stamp and returns
    // the row -- which is what the in-memory store did.
    assignments.push(`UpdatedAt = @updatedAt`);

    request.input("id", sql.UniqueIdentifier, id);
    request.input("updatedAt", sql.DateTime2(3), new Date(updatedAt));

    // A separate parameter name from the patch's own `status`: one is the
    // value being written, the other the value being required.
    //
    // `DeletedAt IS NULL` in both: a delete that commits between a handler's
    // read and this write leaves the update affecting nothing, so no late
    // write lands on a deleted event. The `null` that follows is the same one a
    // lost compare-and-set produces; the route tells the two apart by
    // re-reading the event (`eventExists` in `lib/events.ts`).
    let predicate = `WHERE Id = @id AND DeletedAt IS NULL`;
    if (expectedStatus !== undefined) {
      request.input("expectedStatus", sql.NVarChar(16), expectedStatus);
      predicate = `WHERE Id = @id AND Status = @expectedStatus AND DeletedAt IS NULL`;
    }

    // The only interpolation here carries no caller data: every fragment is a
    // column name from the fixed list in `assignPatch` or one of the two
    // predicates above, and every value is bound.
    const result = await request.query(
      `UPDATE dbo.Events_Events SET ${assignments.join(", ")} ${predicate};`,
    );

    if (result.rowsAffected[0] === 0) return null;

    if (Object.hasOwn(patch, "coHostIds")) {
      await transaction
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(DELETE_COHOSTS_FOR_EVENT);
      for (const userId of patch.coHostIds ?? []) {
        await transaction
          .request()
          .input("eventId", sql.UniqueIdentifier, id)
          .input("userId", sql.UniqueIdentifier, userId)
          .query(INSERT_COHOST);
      }
    }

    if (Object.hasOwn(patch, "invitedUserIds")) {
      await transaction
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(DELETE_INVITES_FOR_EVENT);
      for (const userId of patch.invitedUserIds ?? []) {
        await transaction
          .request()
          .input("eventId", sql.UniqueIdentifier, id)
          .input("userId", sql.UniqueIdentifier, userId)
          .query(INSERT_INVITE);
      }
    }

  return readEvent(transaction, id);
  });
}

/**
 * Soft-delete the event: stamp `DeletedAt`, and `UpdatedAt` with it.
 *
 * Nothing is removed. The event's registrations, co-hosts and invitations stay
 * in the database exactly as they were; every event read filters the row out,
 * so they are unreachable rather than gone. There is no restore and no purge.
 *
 * **The event row is locked first, and that ordering is kept on purpose.** A
 * seat claim locks the event row and then writes a registration; every
 * transaction in this application takes the event row first, and nothing
 * acquires two. This one now writes only the event row itself, but taking the
 * lock first keeps it in that order and gives a deleted or missing event the
 * same `false` before anything is written.
 */
export async function removeEvent(id: string, now: string): Promise<boolean> {
  if (!isUuid(id)) return false;

  const pool = await getPool();

  return inTransaction(pool, async (transaction) => {
    // No live row to lock is no event to delete -- missing, or deleted
    // already -- and the same `false` the caller would get from the update.
    if (!(await lockEvent(transaction, id))) return false;

    const result = await transaction
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .input("now", sql.DateTime2(3), new Date(now))
      .query(SOFT_DELETE_EVENT);

    // Whether a live event was there at all. A miss writes nothing and answers
    // `false`, the same as the in-memory store's "no such index".
    return result.rowsAffected[0] > 0;
  });
}

/* -------------------------------------------------------------- invitations */

/**
 * What happened to an attempt to invite one person.
 *
 * Shaped like `SeatClaim` in `lib/data/seats.ts`, for the same reason: a
 * refusal carries the availability the rule produced under the lock, so the
 * route words it with the same helper it uses for a refusal it caught itself.
 */
export type InvitationWrite =
  | { outcome: "invited" }
  | { outcome: "refused"; availability: InvitationAvailability }
  | { outcome: "gone" };

/** The same, for revoking one person's invitation. */
export type InvitationRevocation =
  | { outcome: "revoked" }
  | { outcome: "refused"; availability: InvitationRevocationAvailability }
  | { outcome: "gone" };

/**
 * Invite one person, atomically.
 *
 * One row, never the list: the whole-list replacement in `updateEvent` would
 * let two hosts overwrite each other's changes, so invitations do not go
 * through it.
 *
 * **The event row is locked first**, with the seat claim's own statement, and
 * the event -- its invite list included -- is read under that lock. That is
 * what makes the rule's answer the true one: every other writer of this event
 * row waits behind it, so the access mode, status, start time and list it sees
 * cannot change before the insert. It is the same event-first order every
 * transaction in this application follows, and it takes one event row.
 *
 * It is not a seat claim. It writes no registration and reads no count, so
 * capacity is not its concern; it shares the lock with the seat protocol only so
 * a claim never reads a list that is changing underneath it.
 */
export async function inviteToEvent({
  eventId,
  invitee,
}: {
  eventId: string;
  invitee: User;
}): Promise<InvitationWrite> {
  if (!isUuid(eventId)) return { outcome: "gone" };

  const pool = await getPool();

  try {
    return await inTransaction(
      pool,
      async (transaction): Promise<InvitationWrite> => {
        const event = await readEvent(
          transaction,
          eventId,
          SELECT_EVENT_FOR_UPDATE,
        );
        if (!event) return { outcome: "gone" };

        // The same rule the route ran, on facts that cannot now move.
        const availability = getInvitationAvailability(event, { invitee });
        if (availability.state !== "open") {
          return { outcome: "refused", availability };
        }

        await transaction
          .request()
          .input("eventId", sql.UniqueIdentifier, eventId)
          .input("userId", sql.UniqueIdentifier, invitee.id)
          .query(INSERT_INVITE);

        return { outcome: "invited" };
      },
    );
  } catch (error) {
    // `PK_Events_EventInvites` -- the only unique key this insert can violate --
    // refusing a second row for this person. Under the lock it should be
    // unreachable, but the key is the real guarantee and this keeps it from
    // surfacing as a 500. Anything else is a failure, not an outcome.
    if (isDuplicateKey(error)) {
      return {
        outcome: "refused",
        availability: { state: "closed", reason: "already_invited" },
      };
    }
    throw error;
  }
}

/**
 * Revoke one person's invitation, atomically.
 *
 * The same shape as inviting: the event row first, the rule re-run against
 * what was read under it, then one row. Only the invitation goes -- whatever
 * registration the person holds stays exactly as it is, and a `going` place
 * keeps counting against capacity.
 */
export async function revokeInvitation({
  eventId,
  invitee,
}: {
  eventId: string;
  invitee: User;
}): Promise<InvitationRevocation> {
  if (!isUuid(eventId)) return { outcome: "gone" };

  const pool = await getPool();

  return inTransaction(
    pool,
    async (transaction): Promise<InvitationRevocation> => {
      const event = await readEvent(
        transaction,
        eventId,
        SELECT_EVENT_FOR_UPDATE,
      );
      if (!event) return { outcome: "gone" };

      const availability = getInvitationRevocationAvailability(event, {
        inviteeId: invitee.id,
      });
      if (availability.state !== "open") {
        return { outcome: "refused", availability };
      }

      const result = await transaction
        .request()
        .input("eventId", sql.UniqueIdentifier, eventId)
        .input("userId", sql.UniqueIdentifier, invitee.id)
        .query(DELETE_INVITE);

      // The rule just read this row under the lock, so nothing should have
      // removed it since. If something did, the person is not invited, which
      // is the answer -- not a success that deleted nothing.
      if (result.rowsAffected[0] === 0) {
        return {
          outcome: "refused",
          availability: { state: "closed", reason: "not_invited" },
        };
      }

      return { outcome: "revoked" };
    },
  );
}
