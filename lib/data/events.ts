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
 * exists without its co-hosts, and deleting one never leaves a registration
 * behind.
 */

import sql from "mssql";
import type { Transaction } from "mssql";

import { getPool, inTransaction, type Runner } from "./client";
import {
  groupByEvent,
  isUuid,
  toEvent,
  type EventRow,
  type MembershipRow,
} from "./rows";
import type { EventRecord, EventStatus } from "../types";
import type { EventPatch } from "../db";

/**
 * `StartsAt` first only so the order never changes between calls. Nothing
 * depends on it: `app/events/page.tsx` sorts and groups the board itself, and
 * `/styleguide` picks its samples by seed id rather than by position.
 */
const SELECT_EVENTS = `
SELECT Id, Title, Summary, Description, StartsAt, EndsAt,
       LocationKind, LocationVenue, LocationAddress, LocationUrl, LocationPlatform,
       Category, Accent, Capacity, Access, Status, OrganizerId, CreatedAt, UpdatedAt
FROM   dbo.Events_Events
ORDER  BY StartsAt ASC, Id ASC;
`;

const SELECT_EVENT = `
SELECT Id, Title, Summary, Description, StartsAt, EndsAt,
       LocationKind, LocationVenue, LocationAddress, LocationUrl, LocationPlatform,
       Category, Accent, Capacity, Access, Status, OrganizerId, CreatedAt, UpdatedAt
FROM   dbo.Events_Events
WHERE  Id = @id;
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
WHERE  Id = @id;
`;

/**
 * The lock on its own, for a writer that needs the mutex but not the facts.
 *
 * `removeEvent` uses it to take the event row before deleting anything that
 * references it, which is what keeps every transaction in this application
 * acquiring locks in the same order.
 */
const LOCK_EVENT = `
SELECT Id
FROM   dbo.Events_Events WITH (UPDLOCK, ROWLOCK)
WHERE  Id = @id;
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

const DELETE_REGISTRATIONS_FOR_EVENT = `
DELETE FROM dbo.Events_Registrations
WHERE  EventId = @id;
`;

const DELETE_EVENT = `
DELETE FROM dbo.Events_Events
WHERE  Id = @id;
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
 * Exported for `lib/data/seats.ts` alone. Nothing else should be locking event
 * rows, and a second caller is a sign the protocol is being reinvented
 * somewhere it should not be.
 */
export async function readEventForUpdate(
  transaction: Transaction,
  id: string,
): Promise<EventRecord | null> {
  if (!isUuid(id)) return null;

  return readEvent(transaction, id, SELECT_EVENT_FOR_UPDATE);
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
 * content fields, and publish sends only `status` -- but the contract is the
 * contract, and `registrations.ts` depends on the same rule for real.
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
 * `invitedUserIds` -- `parseEventForm` cannot produce them and publish sends
 * only `status` -- but `EventPatch` allows them, so they are handled rather
 * than quietly ignored.
 *
 * `expectedStatus` is compare-and-set, and publishing is what wants it: two
 * requests that both read a draft must not both publish it. The second finds no
 * row in `draft` any more, affects nothing, and gets the `null` that route
 * handlers already report as a conflict.
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
    let predicate = `WHERE Id = @id`;
    if (expectedStatus !== undefined) {
      request.input("expectedStatus", sql.NVarChar(16), expectedStatus);
      predicate = `WHERE Id = @id AND Status = @expectedStatus`;
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
 * Delete the event and everything that points at it.
 *
 * Children first, because every foreign key is `ON DELETE NO ACTION` -- Slice 4
 * chose that deliberately so a forgotten cleanup fails loudly instead of
 * cascading invisibly. This is the cleanup, and it is visible.
 *
 * The registrations go with it, which is the behaviour `lib/db.ts` had and what
 * the delete dialog warns about; orphaned registrations would otherwise show up
 * in "my events" forever.
 *
 * **The event row is locked first, and that ordering is the point.** A seat
 * claim locks the event row and then writes a registration; this transaction
 * writes registrations and then the event row. Taken in that order the two
 * deadlock -- each holding what the other needs next -- so this takes the event
 * row before touching anything that references it. Every transaction in this
 * application now acquires the event row first, and nothing acquires two.
 *
 * The delete order itself is unchanged: children before parent, because every
 * foreign key is `ON DELETE NO ACTION`. Only a lock acquisition is added in
 * front of it.
 */
export async function removeEvent(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;

  const pool = await getPool();

  return inTransaction(pool, async (transaction) => {
    const locked = await transaction
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query<{ Id: string }>(LOCK_EVENT);

    // No row to lock is no event to delete, and the same `false` the caller
    // would have got from the delete below.
    if (locked.recordset[0] === undefined) return false;

    for (const statement of [
      DELETE_REGISTRATIONS_FOR_EVENT,
      DELETE_COHOSTS_FOR_EVENT,
      DELETE_INVITES_FOR_EVENT,
    ]) {
      await transaction
        .request()
        .input("id", sql.UniqueIdentifier, id)
        .query(statement);
    }

    const result = await transaction
      .request()
      .input("id", sql.UniqueIdentifier, id)
      .query(DELETE_EVENT);

    // Whether the event was there at all. A miss deletes nothing and answers
    // `false`, the same as the in-memory store's "no such index".
    return result.rowsAffected[0] > 0;
  });
}
