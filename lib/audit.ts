/**
 * The audit log's records, and the policy for writing them. SERVER ONLY.
 *
 * The audit log (`dbo.Events_AuditLog`, migration 0004) records who did what:
 * one row per audited request -- an API action or a page view -- with its
 * outcome. It is not the application log (`lib/log.ts`), which records what
 * broke; the two are joined by the request id.
 *
 * This module decides what a row may contain and how hard to try to write it.
 * It does not know how a row reaches the database: `writeAudit` is handed the
 * insert (`insertAudit` in `lib/data/audit.ts`, through `db.audit.record`), so
 * every rule here can be exercised without a database by
 * `scripts/check-logging.mts`. For the same reason its imports carry file
 * extensions and it imports nothing that needs Next or a driver.
 *
 * THE RECORD. The caller passes everything: request id, actor, operation,
 * outcome, timing. Nothing is read from the request context here, so a write
 * can never be credited to whichever request happens to be current. Values are
 * checked against the column types and the allowed sets; a record that fails
 * is not written, and the failure is logged as `invalid_record:<field>`.
 *
 * METADATA is a small JSON object with allowlisted keys only (`section`,
 * `filters`, `view`, `resultStatus`, `fieldErrors`, `actorFallback`). Unknown
 * keys and values of the wrong kind are dropped. If what remains serialises to
 * more than 1,000 characters, the row is written without it and
 * `audit.metadata_dropped` is logged -- the event matters more than its detail.
 *
 * THE WRITE (decision D15). The insert never joins a business transaction, and
 * `writeAudit` never throws: an audit failure never changes a business result.
 *
 *   - Overall deadline 1,500 ms, from the call to the end: waiting for a
 *     connection and every attempt. `requestTimeout` alone does not bound the
 *     wait for a pooled connection, so the deadline is a timer raced against
 *     the insert.
 *   - First attempt: `requestTimeout` 1,000 ms (or less, if less remains).
 *   - At most one retry, only for a retryable failure -- a dropped connection,
 *     an Azure transient error, a deadlock -- and only with at least 300 ms
 *     left; the retry gets the time that remains. Never after a timeout or a
 *     cancellation: the database is slow, and a retry would spend the rest of
 *     the budget for nothing. Never after a permanent error.
 *   - A duplicate key (2627, 2601) means the row is already there. `RequestId`
 *     is unique, so at most one row per request can exist whatever happens.
 *     After a retry that is the expected end of an ambiguous first attempt
 *     (`audit.write_deduplicated`, debug); on a first attempt it means the
 *     writer ran twice for one request, which is a caller bug
 *     (`audit.duplicate_request`, warn).
 *   - When the deadline passes, the current query is cancelled if it has
 *     started, and an attempt still waiting for a connection is told not to
 *     start. Neither is a guarantee that nothing was written -- the INSERT may
 *     already have committed -- so such a failure is logged with
 *     `ambiguous: true`, never as "not written".
 *
 * WHEN IT FAILS, the application log gets `audit.write_failed` (error) with
 * the request id, operation, outcome, HTTP status, reason, attempts, elapsed
 * time, the SQL error number and code if any, and `ambiguous`. Never the
 * actor, the name, the ids of the event or subject, the metadata, or the
 * driver's message: application logs carry no actor, and a driver message can
 * quote data.
 */

import { errorNumber } from "./data/errors.ts";
import { errorKind, log } from "./log.ts";

/* ----------------------------------------------------------- allowed values */

/** Every operation the audit log records (M12 plan, section E3). */
export const AUDIT_OPERATIONS = [
  "board.view",
  "event.view",
  "event.create_form.view",
  "event.create",
  "event.update",
  "event.delete",
  "event.publish",
  "event.cancel",
  "registration.register",
  "registration.withdraw",
  "request.approve",
  "request.reject",
  "attendee.remove",
  "attendee.restore",
  "invitation.add",
  "invitation.revoke",
  "share.email",
] as const;
export type AuditOperation = (typeof AUDIT_OPERATIONS)[number];

/** `CK_Events_AuditLog_Outcome`. */
export const AUDIT_OUTCOMES = ["success", "rejected", "denied", "not_found", "invalid", "error"] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

/** `CK_Events_AuditLog_Channel`. */
export const AUDIT_CHANNELS = ["api", "page"] as const;
export type AuditChannel = (typeof AUDIT_CHANNELS)[number];

/** `CK_Events_AuditLog_SubjectType`. */
export const AUDIT_SUBJECT_TYPES = ["registration", "user"] as const;
export type AuditSubjectType = (typeof AUDIT_SUBJECT_TYPES)[number];

/** The column limits in migration 0004, in characters. */
export const AUDIT_LIMITS = {
  actorName: 200,
  httpMethod: 8,
  route: 200,
  reasonCode: 64,
  metadata: 1000,
} as const;

/* ------------------------------------------------------------------ records */

/** Only these keys reach `Metadata`, and only with values of these kinds. */
export type AuditMetadata = {
  /** The board section shown. */
  section?: string;
  /** The board's filter values, by filter name. */
  filters?: Record<string, string>;
  /** `host` when the detail page rendered the host lists. */
  view?: string;
  /** The status a result had, where the outcome alone does not say. */
  resultStatus?: string;
  /** The names of the fields that failed validation -- never their values. */
  fieldErrors?: string[];
  /** True only when the persona fell back to the default user. */
  actorFallback?: boolean;
};

/** What a caller hands `writeAudit`: one audited request, complete. */
export type AuditInput = {
  /** When the request started, by the application's clock. */
  occurredAt: Date;
  /** The server-generated request id (`proxy.ts`). */
  requestId: string;
  /** `null` when no user was resolved before the request ended. */
  actor: { userId: string; name: string } | null;
  channel: AuditChannel;
  /** `GET`, `POST`, ... */
  httpMethod: string;
  /** A route pattern (`/api/events/:id`), never a URL. */
  route: string;
  operation: AuditOperation;
  eventId?: string | null;
  subject?: { type: AuditSubjectType; id: string } | null;
  outcome: AuditOutcome;
  httpStatus: number;
  /** A machine-readable code, never a message. */
  reasonCode?: string | null;
  durationMs?: number | null;
  metadata?: AuditMetadata | null;
};

/** One row of `dbo.Events_AuditLog`, checked and ready to insert. */
export type AuditRow = {
  id: string;
  occurredAt: Date;
  requestId: string;
  actorUserId: string | null;
  actorName: string | null;
  channel: AuditChannel;
  httpMethod: string;
  route: string;
  operation: AuditOperation;
  eventId: string | null;
  subjectType: AuditSubjectType | null;
  subjectId: string | null;
  outcome: AuditOutcome;
  httpStatus: number;
  reasonCode: string | null;
  durationMs: number | null;
  metadata: string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HTTP_METHOD = /^[A-Z]{1,8}$/;
const REASON_CODE = /^[a-z0-9_:.-]{1,64}$/;
/** A metadata string: short, single-line, printable. */
const METADATA_TEXT = /^[^\u0000-\u001f]{0,100}$/;
const INT_MAX = 2_147_483_647;

function isOneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function isUuidValue(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** The allowlisted metadata, as JSON; `null` when nothing allowed is left. */
export function serializeMetadata(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const source = metadata as Record<string, unknown>;
  const safe: AuditMetadata = {};

  for (const key of ["section", "view", "resultStatus"] as const) {
    const value = source[key];
    if (typeof value === "string" && METADATA_TEXT.test(value)) safe[key] = value;
  }
  if (typeof source.filters === "object" && source.filters !== null && !Array.isArray(source.filters)) {
    const filters: Record<string, string> = {};
    for (const [name, value] of Object.entries(source.filters as Record<string, unknown>)) {
      if (METADATA_TEXT.test(name) && typeof value === "string" && METADATA_TEXT.test(value)) {
        filters[name] = value;
      }
    }
    if (Object.keys(filters).length > 0) safe.filters = filters;
  }
  if (Array.isArray(source.fieldErrors)) {
    const names = source.fieldErrors.filter(
      (name): name is string => typeof name === "string" && METADATA_TEXT.test(name),
    );
    if (names.length > 0) safe.fieldErrors = names;
  }
  if (source.actorFallback === true) safe.actorFallback = true;

  return Object.keys(safe).length === 0 ? null : JSON.stringify(safe);
}

/**
 * Checks a record against the columns and the allowed sets. `problem` names
 * the first field that is wrong, for the log; the value itself is never
 * echoed.
 */
export function toAuditRow(
  input: AuditInput,
  id: string,
): { ok: true; row: AuditRow; metadataDropped: boolean } | { ok: false; problem: string } {
  const fail = (problem: string) => ({ ok: false as const, problem });

  if (typeof input !== "object" || input === null) return fail("input");
  if (!isUuidValue(id)) return fail("id");
  // datetime2 holds years 0001 to 9999.
  if (
    !(input.occurredAt instanceof Date) ||
    Number.isNaN(input.occurredAt.getTime()) ||
    input.occurredAt.getUTCFullYear() < 1 ||
    input.occurredAt.getUTCFullYear() > 9999
  ) {
    return fail("occurredAt");
  }
  if (!isUuidValue(input.requestId)) return fail("requestId");

  const actor = input.actor ?? null;
  if (actor !== null) {
    if (!isUuidValue(actor.userId)) return fail("actor.userId");
    if (typeof actor.name !== "string" || actor.name.length === 0 || actor.name.length > AUDIT_LIMITS.actorName) {
      return fail("actor.name");
    }
  }

  if (!isOneOf(AUDIT_CHANNELS, input.channel)) return fail("channel");
  if (typeof input.httpMethod !== "string" || !HTTP_METHOD.test(input.httpMethod)) return fail("httpMethod");
  if (
    typeof input.route !== "string" ||
    !input.route.startsWith("/") ||
    input.route.length > AUDIT_LIMITS.route ||
    input.route.includes("?")
  ) {
    return fail("route");
  }
  if (!isOneOf(AUDIT_OPERATIONS, input.operation)) return fail("operation");

  const eventId = input.eventId ?? null;
  if (eventId !== null && !isUuidValue(eventId)) return fail("eventId");

  const subject = input.subject ?? null;
  if (subject !== null) {
    if (!isOneOf(AUDIT_SUBJECT_TYPES, subject.type)) return fail("subject.type");
    if (!isUuidValue(subject.id)) return fail("subject.id");
  }

  if (!isOneOf(AUDIT_OUTCOMES, input.outcome)) return fail("outcome");
  if (!Number.isInteger(input.httpStatus) || input.httpStatus < 100 || input.httpStatus > 599) {
    return fail("httpStatus");
  }

  const reasonCode = input.reasonCode ?? null;
  if (reasonCode !== null && (typeof reasonCode !== "string" || !REASON_CODE.test(reasonCode))) {
    return fail("reasonCode");
  }

  const durationMs = input.durationMs ?? null;
  if (durationMs !== null && (!Number.isInteger(durationMs) || durationMs < 0 || durationMs > INT_MAX)) {
    return fail("durationMs");
  }

  const serialized = serializeMetadata(input.metadata);
  const metadataDropped = serialized !== null && serialized.length > AUDIT_LIMITS.metadata;

  return {
    ok: true,
    metadataDropped,
    row: {
      id: id.toLowerCase(),
      occurredAt: input.occurredAt,
      requestId: input.requestId.toLowerCase(),
      actorUserId: actor === null ? null : actor.userId.toLowerCase(),
      actorName: actor === null ? null : actor.name,
      channel: input.channel,
      httpMethod: input.httpMethod,
      route: input.route,
      operation: input.operation,
      eventId: eventId === null ? null : eventId.toLowerCase(),
      subjectType: subject === null ? null : subject.type,
      subjectId: subject === null ? null : subject.id.toLowerCase(),
      outcome: input.outcome,
      httpStatus: input.httpStatus,
      reasonCode,
      durationMs,
      metadata: metadataDropped ? null : serialized,
    },
  };
}

/* ------------------------------------------------------------ the D15 write */

/** The approved D15 numbers. */
export const AUDIT_WRITE_POLICY = {
  deadlineMs: 1500,
  firstAttemptTimeoutMs: 1000,
  minRemainingForRetryMs: 300,
} as const;

/**
 * Shared between the writer and one insert attempt. The insert registers how
 * to cancel its query once it has one; the writer marks the attempt abandoned
 * at the deadline, so an insert still waiting for a connection does not start
 * its query afterwards.
 */
export type AuditAttempt = {
  cancel: (() => void) | undefined;
  abandoned: boolean;
};

/** Inserts one row. `requestTimeoutMs` is always at least 1. */
export type AuditInsert = (row: AuditRow, requestTimeoutMs: number, attempt: AuditAttempt) => Promise<void>;

export type AuditWriteResult = {
  status: "written" | "deduplicated" | "failed" | "invalid";
  attempts: number;
  /** True when the row may or may not exist. */
  ambiguous: boolean;
};

/** Driver codes for a connection that failed mid-flight: retryable, and possibly sent. */
const RETRYABLE_CODES = new Set(["ESOCKET", "ECONNCLOSED", "ECONNRESET"]);
/** Azure SQL transient errors and the deadlock victim: retryable, and certainly not written. */
const RETRYABLE_NUMBERS = new Set([40613, 40501, 40197, 49918, 49919, 49920, 10928, 10929, 1205]);
const TIMEOUT_CODES = new Set(["ETIMEOUT", "ECANCEL"]);
/**
 * Driver codes raised before a query is sent, so certainly not written:
 * `ELOGIN` and `EINSTLOOKUP` while connecting (tedious), `ENOTOPEN`, `EARGS`,
 * `EINJECT` and `EPARAM` while building the request (mssql). Any code not
 * listed here, or above, is treated as an unknown outcome.
 */
const PRE_SEND_CODES = new Set(["ELOGIN", "EINSTLOOKUP", "ENOTOPEN", "EARGS", "EINJECT", "EPARAM"]);
const DUPLICATE_KEY_NUMBERS = new Set([2627, 2601]);

type Failure = {
  /** The `reason` logged if this is the last attempt. */
  reason: "connection" | "timeout" | "sql_error" | "writer_bug";
  retryable: boolean;
  /** Whether this attempt may have written the row. */
  ambiguous: boolean;
};

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function classify(error: unknown): Failure | "duplicate" {
  const number = errorNumber(error);
  if (number !== undefined && DUPLICATE_KEY_NUMBERS.has(number)) return "duplicate";
  const code = errorCode(error);
  if (code !== undefined && TIMEOUT_CODES.has(code)) {
    return { reason: "timeout", retryable: false, ambiguous: true };
  }
  if (code !== undefined && RETRYABLE_CODES.has(code)) {
    return { reason: "connection", retryable: true, ambiguous: true };
  }
  if (number !== undefined) {
    return { reason: "sql_error", retryable: RETRYABLE_NUMBERS.has(number), ambiguous: false };
  }
  if (code !== undefined) {
    // Only codes known to be raised before anything is sent are a definite
    // non-write. Any other driver code -- `ECLOSE` and `EPIPE` when the
    // connection drops mid-query among them -- may have reached the server.
    return { reason: "connection", retryable: false, ambiguous: !PRE_SEND_CODES.has(code) };
  }
  // No code and no SQL number. A programming error is the writer's bug;
  // anything else -- a missing connection string, a pool that could not hand
  // out a connection -- failed while getting a connection, before any query.
  if (error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError || error instanceof SyntaxError) {
    return { reason: "writer_bug", retryable: false, ambiguous: false };
  }
  return { reason: "connection", retryable: false, ambiguous: false };
}

/** The error's kind, code and SQL number -- never its message. */
function safeError(error: unknown) {
  const number = errorNumber(error);
  return number === undefined ? errorKind(error) : { ...errorKind(error), number };
}

const DEADLINE = Symbol("deadline");

/**
 * Writes one audit row under the D15 policy. Never throws, never takes longer
 * than the deadline (plus timer slack), and never logs the actor.
 */
export async function writeAudit(
  input: AuditInput,
  insert: AuditInsert,
  options: {
    /** The row id. A fresh UUID unless a check supplies one. */
    newId?: () => string;
    /** The clock the deadline arithmetic reads, in ms; a check can drive it. */
    now?: () => number;
  } = {},
): Promise<AuditWriteResult> {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const elapsed = () => Math.round(now() - startedAt);
  let attempts = 0;
  let ambiguous = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Read defensively: this runs in `catch` too, and the input may be anything.
  const context = () => ({
    requestId: typeof input?.requestId === "string" && UUID.test(input.requestId) ? input.requestId.toLowerCase() : undefined,
    component: "audit",
    op: isOneOf(AUDIT_OPERATIONS, input?.operation) ? input.operation : undefined,
    outcome: isOneOf(AUDIT_OUTCOMES, input?.outcome) ? input.outcome : undefined,
    status: Number.isInteger(input?.httpStatus) ? input.httpStatus : undefined,
  });
  const failed = (reason: string, error?: unknown): AuditWriteResult => {
    log.error("audit.write_failed", {
      ...context(),
      reason,
      attempts,
      ambiguous,
      durationMs: elapsed(),
      err: error === undefined ? undefined : safeError(error),
    });
    return { status: "failed", attempts, ambiguous };
  };

  try {
    const checked = toAuditRow(input, newId());
    if (!checked.ok) {
      // The field's name only -- a fixed string from `toAuditRow` -- never its value.
      log.error("audit.write_failed", {
        ...context(),
        reason: `invalid_record:${checked.problem}`,
        attempts: 0,
        ambiguous: false,
      });
      return { status: "invalid", attempts: 0, ambiguous: false };
    }
    if (checked.metadataDropped) {
      log.warn("audit.metadata_dropped", { ...context(), reason: "too_long" });
    }
    const row = checked.row;

    const deadline = new Promise<typeof DEADLINE>((resolve) => {
      timer = setTimeout(() => resolve(DEADLINE), AUDIT_WRITE_POLICY.deadlineMs);
    });

    for (;;) {
      attempts += 1;
      const remaining = AUDIT_WRITE_POLICY.deadlineMs - elapsed();
      // Never 0: the driver reads a zero timeout as "no timeout".
      const requestTimeoutMs = Math.max(
        1,
        attempts === 1 ? Math.min(AUDIT_WRITE_POLICY.firstAttemptTimeoutMs, remaining) : remaining,
      );
      const attempt: AuditAttempt = { cancel: undefined, abandoned: false };

      // `then` first, so a synchronous throw from `insert` becomes a failure
      // of this attempt rather than escaping.
      const outcome = await Promise.race([
        Promise.resolve()
          .then(() => insert(row, requestTimeoutMs, attempt))
          .then(
            () => ({ ok: true as const }),
            (error: unknown) => ({ ok: false as const, error }),
          ),
        deadline,
      ]);

      if (outcome === DEADLINE) {
        attempt.abandoned = true;
        try {
          attempt.cancel?.();
        } catch {
          // A query that cannot be cancelled may still finish; `ambiguous` says so.
        }
        ambiguous = true;
        return failed("deadline");
      }

      if (outcome.ok) {
        return { status: "written", attempts, ambiguous: false };
      }

      const failure = classify(outcome.error);
      if (failure === "duplicate") {
        if (attempts === 1) {
          log.warn("audit.duplicate_request", { ...context(), attempts });
        } else {
          log.debug("audit.write_deduplicated", { ...context(), attempts });
        }
        return { status: "deduplicated", attempts, ambiguous: false };
      }

      ambiguous = ambiguous || failure.ambiguous;
      const remainingAfter = AUDIT_WRITE_POLICY.deadlineMs - elapsed();
      if (
        failure.retryable &&
        attempts === 1 &&
        remainingAfter >= AUDIT_WRITE_POLICY.minRemainingForRetryMs
      ) {
        continue;
      }
      return failed(failure.reason, outcome.error);
    }
  } catch (error) {
    return failed("writer_bug", error);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
