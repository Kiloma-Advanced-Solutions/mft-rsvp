/**
 * Registration reads and writes. SERVER ONLY -- it reaches `client.ts`.
 *
 * The subtle part of this file is `updateRegistration`, and it is worth
 * reading the comment on `assignPatch` before changing anything in it.
 */

import sql from "mssql";
import type { Request, Transaction } from "mssql";

import { getPool, type Runner } from "./client";
import { isUuid, toRegistration, type RegistrationRow } from "./rows";
import type { Registration, RegistrationStatus } from "../types";
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

const SELECT_BY_ID = `
SELECT Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt, DecidedBy, DecidedAt
FROM   dbo.Events_Registrations
WHERE  Id = @id;
`;

const INSERT = `
INSERT INTO dbo.Events_Registrations
    (Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt, DecidedBy, DecidedAt)
VALUES
    (@id, @eventId, @userId, @status, @message, @createdAt, @updatedAt, @decidedBy, @decidedAt);
`;

/**
 * How many people hold a confirmed place.
 *
 * `going` is the only status that counts against capacity -- `TASKS.md` section
 * 4, and `toEventContext` in `lib/events.ts` counts the same way. The literal is
 * a domain constant rather than caller data, which is why it is written into
 * the statement instead of bound.
 *
 * Read inside the seat-claim transaction, where the event row is already
 * U-locked, this count is stable until that transaction commits: no other
 * writer can produce a `going` row without first taking the same lock.
 */
const COUNT_GOING = `
SELECT COUNT(*) AS GoingCount
FROM   dbo.Events_Registrations
WHERE  EventId = @eventId AND Status = N'going';
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

/**
 * One row by its own id, on the pool.
 *
 * Paired with `readRegistrationById` below exactly as `updateRegistration` is
 * with `updateRegistrationOn`, and for the same reason: the seat-claim path
 * needs this read on its own transaction, under the event-row lock, while a
 * route deciding whether a row exists at all needs it outside one. It sits up
 * here with the ordinary reads because that is what it is -- the section below
 * is the runner-taking half.
 *
 * It is also where **id case stops being anybody else's problem.** The
 * parameter is bound as a `uniqueidentifier`, and SQL Server compares those by
 * value rather than by spelling, so `F1AEB57F-…` and `f1aeb57f-…` find the same
 * row; `toRegistration` then lower-cases what comes back. A route that compared
 * a URL segment against an already-normalised `id` in JavaScript could not do
 * either, and answered a correct upper-case id with a 404 -- which is what both
 * decision routes used to do. Nothing above `lib/data/` should know the storage
 * engine has an opinion about case, and with this it does not have to.
 */
export async function getRegistration(id: string): Promise<Registration | null> {
  return readRegistrationById(await getPool(), id);
}

/* ------------------------------------------- reads for the seat-claim path */

/*
 * The three below take a `Runner` so `lib/data/seats.ts` can issue them on its
 * own transaction, under the event-row lock, and get the facts as they stand
 * inside it. The same statements on the pool would read the world outside the
 * lock, which is the whole bug Slice 8 exists to fix.
 */

/**
 * How many confirmed places are taken at this event, right now.
 *
 * Deliberately **not** guarded with `isUuid`, unlike every other read in this
 * file. Those answer a malformed id with "nothing matched", which is harmless
 * for a list or a lookup; here the equivalent answer is `0`, and `0` means "the
 * event is empty, let them in". A capacity check must not have a value it fails
 * open to. Its only caller reads the event through `readEventForUpdate` first
 * and stops if that returns `null`, so the id is already known to be a real
 * one -- and if a future caller skips that, the driver rejecting the parameter
 * is the better failure.
 */
export async function countGoing(
  runner: Runner,
  eventId: string,
): Promise<number> {
  const result = await runner
    .request()
    .input("eventId", sql.UniqueIdentifier, eventId)
    .query<{ GoingCount: number }>(COUNT_GOING);

  return result.recordset[0].GoingCount;
}

/** This person's row at this event, if they have one. */
export async function readRegistrationForUser(
  runner: Runner,
  eventId: string,
  userId: string,
): Promise<Registration | null> {
  if (!isUuid(eventId) || !isUuid(userId)) return null;

  const result = await runner
    .request()
    .input("eventId", sql.UniqueIdentifier, eventId)
    .input("userId", sql.UniqueIdentifier, userId)
    .query<RegistrationRow>(SELECT_BY_EVENT_AND_USER);

  const row = result.recordset[0];
  return row === undefined ? null : toRegistration(row);
}

/** One row by its own id. */
export async function readRegistrationById(
  runner: Runner,
  id: string,
): Promise<Registration | null> {
  if (!isUuid(id)) return null;

  const result = await runner
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<RegistrationRow>(SELECT_BY_ID);

  const row = result.recordset[0];
  return row === undefined ? null : toRegistration(row);
}

/* ------------------------------------------------------------------- writes */

/**
 * Writes one complete registration row. Ids and timestamps come from
 * `lib/db.ts`, never from the server -- the application owns both.
 *
 * **It takes a `Transaction`, not a `Runner`, and that is the point rather
 * than a convenience.** A new registration may be `going`, and a `going` row is
 * only safe to write while its event row is locked and its capacity has been
 * re-checked under that lock. Requiring a transaction makes "you are inside the
 * seat-claim protocol" a fact the compiler checks instead of a rule a comment
 * asks for. `lib/data/seats.ts` is the only caller, and there is deliberately
 * no pool-based version: anyone who had one would not be holding the lock.
 */
export async function createRegistrationOn(
  transaction: Transaction,
  record: Registration,
): Promise<void> {
  await transaction
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
 *
 * **`expectedStatus` is compare-and-set, and it is what makes a transition
 * safe under concurrency.** A caller that read a row, decided something about
 * it, and now wants to write passes the status it decided on; the row is only
 * written if it is still in that status. Two hosts deciding the same request,
 * or somebody withdrawing while a host approves, therefore cannot both win: one
 * update matches, the other affects no rows and comes back `null` -- which
 * every caller already turns into the "this changed underneath you" conflict.
 *
 * Without it, `WHERE Id = @id` would let the second writer overwrite the first
 * decision with one based on a state that is no longer true.
 *
 * Omitting `expectedStatus` keeps the unconditional behaviour, which is what
 * callers that are not making a state transition still want.
 */
export async function updateRegistration(
  id: string,
  patch: RegistrationPatch,
  updatedAt: string,
  expectedStatus?: RegistrationStatus,
): Promise<Registration | null> {
  return updateRegistrationOn(
    await getPool(),
    id,
    patch,
    updatedAt,
    expectedStatus,
  );
}

/**
 * The same update, on a given runner.
 *
 * `lib/data/seats.ts` needs this to write through its own transaction: the
 * pool-based version above would run on a different connection, so the write
 * would commit on its own and survive a rollback the rest of the seat claim
 * needed it to follow.
 */
export async function updateRegistrationOn(
  runner: Runner,
  id: string,
  patch: RegistrationPatch,
  updatedAt: string,
  expectedStatus?: RegistrationStatus,
): Promise<Registration | null> {
  if (!isUuid(id)) return null;

  const request = runner.request();

  const assignments = assignPatch(request, patch);
  assignments.push(`UpdatedAt = @updatedAt`);

  request.input("id", sql.UniqueIdentifier, id);
  request.input("updatedAt", sql.DateTime2(3), new Date(updatedAt));

  // A separate parameter name from the patch's own `status`, which is the value
  // being written rather than the one being required.
  let predicate = `WHERE Id = @id`;
  if (expectedStatus !== undefined) {
    request.input("expectedStatus", sql.NVarChar(16), expectedStatus);
    predicate = `WHERE Id = @id AND Status = @expectedStatus`;
  }

  // The only interpolation in this file, and it carries no caller data: every
  // fragment is a column name from the fixed list in `assignPatch` or one of
  // the two predicates above, and every value is a bound parameter.
  const result = await request.query<RegistrationRow>(
    `UPDATE dbo.Events_Registrations SET ${assignments.join(", ")} ${predicate};
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
