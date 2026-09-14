/**
 * Registration reads and writes. SERVER ONLY -- it reaches `client.ts`.
 *
 * The subtle part of this file is `updateRegistration`, and it is worth
 * reading the comment on `assignPatch` before changing anything in it.
 */

import sql from "mssql";
import type { Request } from "mssql";

import { getPool } from "./client";
import { isUuid, toRegistration, type RegistrationRow } from "./rows";
import type { Registration } from "../types";
import type { RegistrationPatch } from "../db";

const COLUMNS = `Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt, DecidedBy, DecidedAt`;

/*
 * Every read below orders by `CreatedAt ASC, Id ASC`.
 *
 * Registration order is one of the few orderings the screens genuinely depend
 * on: `attendees` and the approval queue in `lib/events.ts` are both rendered
 * in the order the rows arrive. `Id` breaks ties, because the fixtures reuse a
 * handful of `CreatedAt` values and an order that flickers between calls is not
 * an order at all.
 */

const SELECT_ALL = `
SELECT Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt, DecidedBy, DecidedAt
FROM   dbo.Events_Registrations
ORDER  BY CreatedAt ASC, Id ASC;
`;

const SELECT_BY_EVENT = `
SELECT Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt, DecidedBy, DecidedAt
FROM   dbo.Events_Registrations
WHERE  EventId = @eventId
ORDER  BY CreatedAt ASC, Id ASC;
`;

const SELECT_BY_USER = `
SELECT Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt, DecidedBy, DecidedAt
FROM   dbo.Events_Registrations
WHERE  UserId = @userId
ORDER  BY CreatedAt ASC, Id ASC;
`;

const SELECT_BY_EVENT_AND_USER = `
SELECT Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt, DecidedBy, DecidedAt
FROM   dbo.Events_Registrations
WHERE  EventId = @eventId AND UserId = @userId
ORDER  BY CreatedAt ASC, Id ASC;
`;

const INSERT = `
INSERT INTO dbo.Events_Registrations
    (Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt, DecidedBy, DecidedAt)
VALUES
    (@id, @eventId, @userId, @status, @message, @createdAt, @updatedAt, @decidedBy, @decidedAt);
`;

const DELETE = `
DELETE FROM dbo.Events_Registrations
WHERE  Id = @id;
`;

/* -------------------------------------------------------------------- reads */

export async function listRegistrations(filter?: {
  eventId?: string;
  userId?: string;
}): Promise<Registration[]> {
  const eventId = filter?.eventId;
  const userId = filter?.userId;

  // A filter on a malformed id matches nothing, which is what the in-memory
  // store's string comparison did.
  if (eventId !== undefined && !isUuid(eventId)) return [];
  if (userId !== undefined && !isUuid(userId)) return [];

  const pool = await getPool();
  const request = pool.request();

  // One statement per shape rather than a built-up WHERE clause: four short
  // literals are easier to read than one assembled string, and `check:tsql`
  // can only see SQL it is handed whole.
  let statement: string;
  if (eventId !== undefined && userId !== undefined) {
    request.input("eventId", sql.UniqueIdentifier, eventId);
    request.input("userId", sql.UniqueIdentifier, userId);
    statement = SELECT_BY_EVENT_AND_USER;
  } else if (eventId !== undefined) {
    request.input("eventId", sql.UniqueIdentifier, eventId);
    statement = SELECT_BY_EVENT;
  } else if (userId !== undefined) {
    request.input("userId", sql.UniqueIdentifier, userId);
    statement = SELECT_BY_USER;
  } else {
    statement = SELECT_ALL;
  }

  const result = await request.query<RegistrationRow>(statement);
  return result.recordset.map(toRegistration);
}

/** A person has at most one registration per event -- `UQ_Events_Registrations_Event_User`. */
export async function findRegistration(
  eventId: string,
  userId: string,
): Promise<Registration | null> {
  if (!isUuid(eventId) || !isUuid(userId)) return null;

  const pool = await getPool();
  const result = await pool
    .request()
    .input("eventId", sql.UniqueIdentifier, eventId)
    .input("userId", sql.UniqueIdentifier, userId)
    .query<RegistrationRow>(SELECT_BY_EVENT_AND_USER);

  const row = result.recordset[0];
  return row === undefined ? null : toRegistration(row);
}

/* ------------------------------------------------------------------- writes */

/**
 * Writes the record the caller already built. Ids and timestamps come from
 * `lib/db.ts`, never from the server -- the application owns both.
 */
export async function createRegistration(record: Registration): Promise<void> {
  const pool = await getPool();
  await pool
    .request()
    .input("id", sql.UniqueIdentifier, record.id)
    .input("eventId", sql.UniqueIdentifier, record.eventId)
    .input("userId", sql.UniqueIdentifier, record.userId)
    .input("status", sql.NVarChar(16), record.status)
    .input("message", sql.NVarChar(sql.MAX), record.message ?? null)
    .input("createdAt", sql.DateTime2(3), new Date(record.createdAt))
    .input("updatedAt", sql.DateTime2(3), new Date(record.updatedAt))
    .input("decidedBy", sql.UniqueIdentifier, record.decidedBy ?? null)
    .input(
      "decidedAt",
      sql.DateTime2(3),
      record.decidedAt === undefined ? null : new Date(record.decidedAt),
    )
    .query(INSERT);
}

/**
 * Turns a patch into `SET` assignments, and this is the one place where the
 * distinction that matters is easy to lose.
 *
 * `Object.hasOwn` -- not `value !== undefined`. A patch key that is **present
 * and undefined** means *clear this field*; a key that is **absent** means
 * *leave it alone*. The in-memory store got this for free, because
 * `structuredClone` keeps properties whose value is `undefined` and the object
 * spread then overwrites:
 *
 *     { ...row, ...{ message: undefined } }  ->  message cleared
 *     { ...row, ...{ status: "cancelled" } } ->  message preserved
 *
 * The registration write path depends on it. Re-registering after withdrawing
 * passes `message: undefined, decidedBy: undefined, decidedAt: undefined` so a
 * revived row starts a new cycle -- otherwise the approval queue would show a
 * host as having already decided a request that has only just been made. A
 * `value !== undefined` test here would silently reinstate exactly that bug.
 *
 * `updatedAt` is ignored even when the patch carries it: `RegistrationPatch`
 * permits the key, and the in-memory store overwrote it unconditionally with
 * its own clock. The stamp is applied by the caller instead.
 */
function assignPatch(request: Request, patch: RegistrationPatch): string[] {
  const assignments: string[] = [];

  const set = (column: string, parameter: string) => {
    assignments.push(`${column} = @${parameter}`);
  };

  if (Object.hasOwn(patch, "eventId")) {
    request.input("eventId", sql.UniqueIdentifier, patch.eventId ?? null);
    set("EventId", "eventId");
  }
  if (Object.hasOwn(patch, "userId")) {
    request.input("userId", sql.UniqueIdentifier, patch.userId ?? null);
    set("UserId", "userId");
  }
  if (Object.hasOwn(patch, "status")) {
    request.input("status", sql.NVarChar(16), patch.status ?? null);
    set("Status", "status");
  }
  if (Object.hasOwn(patch, "message")) {
    request.input("message", sql.NVarChar(sql.MAX), patch.message ?? null);
    set("Message", "message");
  }
  if (Object.hasOwn(patch, "decidedBy")) {
    request.input("decidedBy", sql.UniqueIdentifier, patch.decidedBy ?? null);
    set("DecidedBy", "decidedBy");
  }
  if (Object.hasOwn(patch, "decidedAt")) {
    request.input(
      "decidedAt",
      sql.DateTime2(3),
      patch.decidedAt === undefined ? null : new Date(patch.decidedAt),
    );
    set("DecidedAt", "decidedAt");
  }

  return assignments;
}

/**
 * Update and read back in one batch.
 *
 * `UPDATE ...; IF @@ROWCOUNT > 0 SELECT ...` is the idiom
 * `scripts/tsql-fixtures/allowed.sql` demonstrates: one round trip, and an
 * empty recordset is how "no such row" arrives -- which is the `null` the
 * in-memory store returned. `@@ROWCOUNT` is read by the statement immediately
 * after the update, which is the only place it means what it looks like.
 *
 * `UpdatedAt` is always assigned, so an empty patch still refreshes the stamp
 * and returns the row, exactly as before.
 */
export async function updateRegistration(
  id: string,
  patch: RegistrationPatch,
  updatedAt: string,
): Promise<Registration | null> {
  if (!isUuid(id)) return null;

  const pool = await getPool();
  const request = pool.request();

  const assignments = assignPatch(request, patch);
  assignments.push(`UpdatedAt = @updatedAt`);

  request.input("id", sql.UniqueIdentifier, id);
  request.input("updatedAt", sql.DateTime2(3), new Date(updatedAt));

  // The only interpolation in this file, and it carries no caller data: every
  // fragment is a column name from the fixed list in `assignPatch`, and every
  // value is a bound parameter.
  const result = await request.query<RegistrationRow>(
    `UPDATE dbo.Events_Registrations SET ${assignments.join(", ")} WHERE Id = @id;
IF @@ROWCOUNT > 0
    SELECT ${COLUMNS} FROM dbo.Events_Registrations WHERE Id = @id;`,
  );

  const row = result.recordset?.[0];
  return row === undefined ? null : toRegistration(row);
}

/**
 * Preserved for API fidelity. Nothing in the product calls it -- withdrawing
 * sets `cancelled` rather than deleting, which is what keeps one registration
 * per person per event -- but the contract had it, so the swap keeps it.
 */
export async function removeRegistration(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;

  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query(DELETE);

  return result.rowsAffected[0] > 0;
}
