/**
 * The audit log's one statement: append a row to `dbo.Events_AuditLog`.
 *
 * The row has already been checked by `toAuditRow` in `lib/audit.ts`, and the
 * policy around this insert -- deadline, retry, duplicate key -- is
 * `writeAudit`'s, there. This module only binds the values and runs the
 * statement.
 *
 * On the pool, never on a business transaction's connection: an audit row is
 * written after the business work has committed or rolled back, and must not
 * be able to hold or extend its locks. Append-only: nothing in the application
 * updates or deletes an audit row, and `check:tsql` refuses SQL that would.
 *
 * Every value is a typed parameter with the column's own type and length, so
 * no value is ever part of the SQL text.
 */

import sql from "mssql";
import type { ConnectionPool, Request } from "mssql";

import type { AuditAttempt, AuditRow } from "../audit";
import { getPool } from "./client";

const INSERT_AUDIT = `
INSERT INTO dbo.Events_AuditLog
    (Id, OccurredAt, RequestId, ActorUserId, ActorName, Channel, HttpMethod, Route,
     Operation, EventId, SubjectType, SubjectId, Outcome, HttpStatus, ReasonCode,
     DurationMs, Metadata)
VALUES
    (@id, @occurredAt, @requestId, @actorUserId, @actorName, @channel, @httpMethod, @route,
     @operation, @eventId, @subjectType, @subjectId, @outcome, @httpStatus, @reasonCode,
     @durationMs, @metadata);
`;

/**
 * A request with its own timeout. `mssql` 12.7.1 takes it as a second
 * constructor argument (`lib/base/request.js`); `@types/mssql` does not
 * declare that argument yet, hence the one cast.
 */
const RequestWithTimeout = sql.Request as unknown as new (
  pool: ConnectionPool,
  overrides: { requestTimeout: number },
) => Request;

export async function insertAudit(
  row: AuditRow,
  requestTimeoutMs: number,
  attempt: AuditAttempt,
): Promise<void> {
  const pool = await getPool();
  // The writer's deadline passed while this attempt waited for a connection:
  // do not start a query nobody is waiting for.
  if (attempt.abandoned) return;

  // Never 0, which the driver reads as "no timeout".
  const request = new RequestWithTimeout(pool, { requestTimeout: Math.max(1, Math.floor(requestTimeoutMs)) });
  attempt.cancel = () => request.cancel();

  await request
    .input("id", sql.UniqueIdentifier, row.id)
    .input("occurredAt", sql.DateTime2(3), row.occurredAt)
    .input("requestId", sql.UniqueIdentifier, row.requestId)
    .input("actorUserId", sql.UniqueIdentifier, row.actorUserId)
    .input("actorName", sql.NVarChar(200), row.actorName)
    .input("channel", sql.NVarChar(8), row.channel)
    .input("httpMethod", sql.NVarChar(8), row.httpMethod)
    .input("route", sql.NVarChar(200), row.route)
    .input("operation", sql.NVarChar(64), row.operation)
    .input("eventId", sql.UniqueIdentifier, row.eventId)
    .input("subjectType", sql.NVarChar(16), row.subjectType)
    .input("subjectId", sql.UniqueIdentifier, row.subjectId)
    .input("outcome", sql.NVarChar(16), row.outcome)
    .input("httpStatus", sql.SmallInt, row.httpStatus)
    .input("reasonCode", sql.NVarChar(64), row.reasonCode)
    .input("durationMs", sql.Int, row.durationMs)
    .input("metadata", sql.NVarChar(1000), row.metadata)
    .query(INSERT_AUDIT);
}
