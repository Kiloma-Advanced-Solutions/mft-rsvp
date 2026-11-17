/**
 * The Route Handler boundary: `withErrorHandling`. SERVER ONLY.
 *
 * It lives apart from `lib/api.ts` because that module is shared with Client
 * Components (`fetchJson`, `RequestError`), and this one writes the application
 * log, which needs Node's `AsyncLocalStorage` and `process.stdout`. A client
 * bundle cannot contain either -- `next build` fails outright when `lib/api.ts`
 * imports the logger -- so the server half is here and the shared half stays
 * there. Responses are still built by `lib/api.ts`, so the contract has one
 * home.
 *
 * Every API request passes through here, which makes it the one place that:
 *
 *   - enters the request context (`lib/requestContext.ts`) with the id the
 *     proxy stamped on the request, so everything the handler awaits -- the
 *     data layer, the mail service -- logs with that id;
 *   - logs what went wrong when a handler fails unexpectedly
 *     (`api.unhandled_error`), or reports that a service behind it failed
 *     (`api.service_failure`, an `ApiError` of 500 or more). An `ApiError`
 *     below 500 is the caller's mistake or an expected refusal, and is not a
 *     technical failure: it is not logged here. Who did what is the audit
 *     log's job, not this one's.
 *
 * Exactly one `api.*` line per failed request, and none for a successful one.
 * (An audited request whose audit write fails also gets the writer's
 * `audit.write_failed`, which carries no actor.)
 *
 * It is also where an audited API action gets its audit row (M12 S4). The
 * operation is declared where the handler is exported --
 *
 *   export const POST = withErrorHandling(handler, { audit: "event.publish" })
 *
 * -- and the wrapper does the rest, once, after the handler has returned or
 * thrown: the response is built first, exactly as without auditing, then the
 * row is derived from it and from the request context, then the write is
 * awaited (`db.audit.record`, decision D15: never throws, never longer than
 * its deadline), and only then is the response returned. Every business
 * transaction has committed or rolled back by then, because transactions live
 * inside the data calls the handler awaited. The write cannot change the
 * response: it is already built. A handler with no `audit` option -- the
 * session routes, decision D13 -- writes no row.
 *
 * With file extensions on its imports, like `lib/log.ts`, so the bare-Node
 * self-check (`scripts/check-logging.mts`) can load it.
 */

import { ApiError, jsonError } from "./api.ts";
import type { AuditInput, AuditMetadata, AuditOperation, AuditOutcome, AuditSubjectType } from "./audit.ts";
import { errorNumber } from "./data/errors.ts";
import { API_ERRORS } from "./labels.ts";
import { errorKind, log, type LogFields } from "./log.ts";
import { currentRequestContext, runWithRequestContext } from "./requestContext.ts";
import { newRequestId, requestIdFrom } from "./requestId.ts";
import type { ScheduleRefusal } from "./types.ts";

/**
 * Every API route this application registers, as its folder under `app/api`
 * spells it. A log line names the route by this pattern -- never by the URL,
 * which carries ids and whatever else a caller chose to type.
 *
 * Next does not hand a Route Handler its own pattern, so the list is written
 * out. `npm run check:logging` compares it with the `route.ts` files on disk,
 * so a route added without a line here fails the check rather than logging as
 * `unmatched`.
 */
export const API_ROUTE_PATTERNS = [
  "/api/events",
  "/api/events/[id]",
  "/api/events/[id]/cancel",
  "/api/events/[id]/invitations/[userId]",
  "/api/events/[id]/publish",
  "/api/events/[id]/registrations",
  "/api/events/[id]/registrations/[registrationId]/approve",
  "/api/events/[id]/registrations/[registrationId]/reject",
  "/api/events/[id]/registrations/[registrationId]/remove",
  "/api/events/[id]/registrations/[registrationId]/restore",
  "/api/events/[id]/share-emails/[userId]",
  "/api/session",
] as const;

/** What a path that matches none of the patterns is logged as. */
export const UNMATCHED_ROUTE = "unmatched";

const DYNAMIC_SEGMENT = /^\[([A-Za-z]+)\]$/;

/** `/api/events/[id]` -> `/api/events/:id`, the form the log uses. */
export function routeLabel(pattern: string): string {
  return pattern
    .split("/")
    .map((segment) => segment.replace(DYNAMIC_SEGMENT, ":$1"))
    .join("/");
}

const COMPILED_ROUTES = API_ROUTE_PATTERNS.map((pattern) => {
  const segments = pattern.split("/");
  return {
    label: routeLabel(pattern),
    segments,
    statics: segments.filter((segment) => !DYNAMIC_SEGMENT.test(segment)).length,
  };
});

/**
 * The route a request path belongs to, as a log label; `unmatched` for anything
 * else. A static segment must match exactly and a dynamic one stands for any
 * single segment, so no part of the actual path -- an id, a query string, a
 * typo -- can reach the log. Where two patterns match, the one with more fixed
 * segments wins, as it does in Next's own routing.
 */
export function apiRouteLabel(pathname: string): string {
  const segments = pathname.replace(/\/+$/, "").split("/");
  let best: (typeof COMPILED_ROUTES)[number] | undefined;
  for (const route of COMPILED_ROUTES) {
    if (route.segments.length !== segments.length) continue;
    const matches = route.segments.every(
      (segment, index) =>
        DYNAMIC_SEGMENT.test(segment) ? segments[index] !== "" : segment === segments[index],
    );
    if (matches && (best === undefined || route.statics > best.statics)) best = route;
  }
  return best?.label ?? UNMATCHED_ROUTE;
}

/** The fields every API log line shares. Never throws: it runs in a `catch`. */
function requestFields(request: Request | undefined, startedAt: number): LogFields {
  let route = UNMATCHED_ROUTE;
  try {
    if (request !== undefined) route = apiRouteLabel(new URL(request.url).pathname);
  } catch {
    // An unparsable URL is still a request worth reporting.
  }
  return {
    component: "api",
    method: request?.method,
    route,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

/* ------------------------------------------------------------ the audit row */

/** The operations an API route may declare: the mutations, never a page view. */
export type ApiAuditOperation = Exclude<AuditOperation, "board.view" | "event.view" | "event.create_form.view">;

type HandlerOptions = {
  /** Audit this handler as this operation. Omitted: no audit row (D13). */
  audit?: ApiAuditOperation;
};

/** Hands one audit record to the writer. Production uses `db.audit.record`. */
export type AuditRecorder = (input: AuditInput) => Promise<unknown>;

/**
 * The refusal reasons recorded as they are; every other closed-availability
 * reason is recorded as `closed:<reason>` (M12 plan, E3).
 */
const BARE_REASONS = new Set(["full", "not_invited", "already_invited"]);

/** The audit reason for a closed availability, e.g. `full` or `closed:draft`. */
export function closedReason(reason: string): string {
  return BARE_REASONS.has(reason) ? reason : `closed:${reason}`;
}

/**
 * The audit reason for a refusal decided by an availability answer: its
 * `reason` when it carries one -- whatever its state, since a request on a
 * full event is `reject_only` with reason `full`, not `closed` -- and `stale`
 * when it carries none (the state moved under the request).
 */
export function availabilityReason(availability: { state: string; reason?: string }): string {
  return typeof availability.reason === "string" ? closedReason(availability.reason) : "stale";
}

/**
 * The audit reason for a refused schedule: `schedule_locked` when a date may
 * not move at all (the event started or was cancelled), `validation` when the
 * new date is simply not acceptable.
 */
export function scheduleReason(errors: Partial<Record<string, ScheduleRefusal>>): string {
  return Object.values(errors).some((refusal) => refusal === "started" || refusal === "cancelled")
    ? "schedule_locked"
    : "validation";
}

/** HTTP status to audit outcome (M12 plan, E3). */
export function outcomeForStatus(status: number): AuditOutcome {
  if (status >= 500) return "error";
  if (status === 403 || status === 401) return "denied";
  if (status === 404) return "not_found";
  if (status === 409) return "rejected";
  if (status >= 400) return "invalid";
  return "success";
}

/** Driver codes and Azure error numbers that mean the database could not be reached. */
const DB_UNAVAILABLE_CODES = new Set([
  "ESOCKET",
  "ECONNCLOSED",
  "ECONNRESET",
  "ECLOSE",
  "EPIPE",
  "ELOGIN",
  "EINSTLOOKUP",
  "ENOTOPEN",
  "ETIMEOUT",
]);
const DB_UNAVAILABLE_NUMBERS = new Set([40613, 40501, 40197, 49918, 49919, 49920, 10928, 10929]);
const DEADLOCK = 1205;

/** The audit reason for an error that is not an `ApiError`. */
export function failureReason(error: unknown): string {
  const number = errorNumber(error);
  if (number === DEADLOCK) return "deadlock";
  if (number !== undefined && DB_UNAVAILABLE_NUMBERS.has(number)) return "db_unavailable";
  const code = errorKind(error).code;
  if (code !== undefined && DB_UNAVAILABLE_CODES.has(code)) return "db_unavailable";
  return "internal";
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A route parameter as an id the audit row may hold, or `null`. */
function idParam(value: unknown): string | null {
  return typeof value === "string" && UUID.test(value) ? value.toLowerCase() : null;
}

/** `context.params`, which Next passes as a promise; `{}` when there is none. */
async function routeParams(context: unknown): Promise<Record<string, unknown>> {
  if (typeof context !== "object" || context === null) return {};
  try {
    const params = await (context as { params?: unknown }).params;
    return typeof params === "object" && params !== null ? (params as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** Which kind of thing a route's second id names. */
const SUBJECT_PARAMS: Array<[string, AuditSubjectType]> = [
  ["registrationId", "registration"],
  ["userId", "user"],
];

/**
 * The names of the fields a 400 refused -- never the messages -- when the
 * error's details are the field-error map the event form uses.
 */
function fieldErrorNames(details: unknown): string[] | undefined {
  if (typeof details !== "object" || details === null || Array.isArray(details)) return undefined;
  const names = Object.keys(details);
  return names.length > 0 ? names : undefined;
}

type Settled = { response: Response; error?: unknown; threw: boolean };

/**
 * Builds and writes this request's audit row. Never throws: the response is
 * already built, and nothing here may change it.
 */
async function auditRequest(
  record: AuditRecorder,
  operation: ApiAuditOperation,
  request: Request | undefined,
  args: unknown[],
  requestId: string,
  occurredAt: Date,
  durationMs: number,
  settled: Settled,
): Promise<void> {
  try {
    const context = currentRequestContext();
    // One row per request. `UNIQUE(RequestId)` holds that in the database too.
    if (context.audit.recorded) return;
    context.audit.recorded = true;

    const params = await routeParams(args[1]);
    const status = settled.response.status;

    let reasonCode: string | null = null;
    if (settled.threw) {
      if (context.audit.committed) reasonCode = "post_commit_error";
      else if (settled.error instanceof ApiError) reasonCode = settled.error.reason ?? settled.error.code ?? null;
      else reasonCode = failureReason(settled.error);
    }

    const metadata: AuditMetadata = {};
    if (context.actor?.fallback) metadata.actorFallback = true;
    if (settled.error instanceof ApiError && settled.error.status === 400) {
      const names = fieldErrorNames(settled.error.details);
      if (names !== undefined) metadata.fieldErrors = names;
    }

    let subject: AuditInput["subject"] = null;
    for (const [name, type] of SUBJECT_PARAMS) {
      const id = idParam(params[name]);
      if (id !== null) {
        subject = { type, id };
        break;
      }
    }

    let route = UNMATCHED_ROUTE;
    try {
      if (request !== undefined) route = apiRouteLabel(new URL(request.url).pathname);
    } catch {
      // Left `unmatched`; the writer refuses it and logs `invalid_record:route`.
    }

    await record({
      occurredAt,
      requestId,
      actor: context.actor === undefined ? null : { userId: context.actor.userId, name: context.actor.name },
      channel: "api",
      httpMethod: request?.method ?? "",
      route,
      operation,
      eventId: operation === "event.create" ? idParam(context.audit.eventId) : idParam(params.id),
      subject,
      outcome: outcomeForStatus(status),
      httpStatus: status,
      reasonCode,
      durationMs,
      metadata,
    });
  } catch (error) {
    // `db.audit.record` never throws; this is the step above it failing, which
    // is this module's bug. The fields every audit failure line carries, and
    // still no actor.
    log.error("audit.write_failed", {
      requestId,
      component: "audit",
      op: operation,
      reason: "writer_bug",
      err: errorKind(error),
    });
  }
}

/* ---------------------------------------------------------------- the wrapper */

/**
 * Builds `withErrorHandling` around a given audit recorder. The application
 * uses the one below, bound to `db.audit.record`; `scripts/check-logging.mts`
 * builds its own with a recorder it can inspect, because the database module
 * cannot be loaded outside Next.
 */
export function createErrorHandling(record: AuditRecorder) {
  /**
   * Wraps a handler so thrown `ApiError`s become clean responses and anything
   * unexpected becomes a 500 without leaking a stack trace to the client.
   *
   *   export const GET = withErrorHandling(async () => { ... })
   *
   * Next calls a Route Handler with the request first, so that is where the id
   * comes from. `requestIdFrom` accepts only a UUID -- which the proxy has
   * already put there, replacing anything the client sent -- and makes a fresh
   * one otherwise.
   */
  return function withErrorHandling<Args extends unknown[]>(
    handler: (...args: Args) => Promise<Response>,
    options: HandlerOptions = {},
  ): (...args: Args) => Promise<Response> {
    return (...args: Args) => {
      const request = args[0] instanceof Request ? args[0] : undefined;
      const requestId = request ? requestIdFrom(request.headers) : newRequestId();

      return runWithRequestContext(requestId, async () => {
        // When the request started, for the audit row; the monotonic clock
        // for its duration.
        const occurredAt = new Date();
        const startedAt = performance.now();
        const settled = await settle(handler, args, request, startedAt);
        // Handler time only: the audit write below is not part of it (D-S4-6).
        const durationMs = Math.round(performance.now() - startedAt);

        if (options.audit !== undefined) {
          await auditRequest(record, options.audit, request, args, requestId, occurredAt, durationMs, settled);
        }
        return settled.response;
      });
    };
  };
}

/** Runs the handler and turns whatever it threw into the response, as before S4. */
async function settle<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
  args: Args,
  request: Request | undefined,
  startedAt: number,
): Promise<Settled> {
  try {
    return { response: await handler(...args), threw: false };
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status >= 500) {
        log.warn("api.service_failure", {
          ...requestFields(request, startedAt),
          status: error.status,
          reason: error.code,
        });
      }
      return {
        response: jsonError(error.status, error.message, {
          code: error.code,
          details: error.details,
        }),
        error,
        threw: true,
      };
    }
    log.error("api.unhandled_error", {
      ...requestFields(request, startedAt),
      status: 500,
      err: error,
    });
    return {
      response: jsonError(500, API_ERRORS.internal, { code: "internal" }),
      error,
      threw: true,
    };
  }
}

/**
 * `db.audit.record`, loaded on first use. A static import would pull the
 * database driver -- and `server-only` -- into this module, which the bare-Node
 * self-check could then no longer load.
 */
async function recordWithDatabase(input: AuditInput): Promise<unknown> {
  const { db } = await import("./db.ts");
  return db.audit.record(input);
}

/**
 * The Route Handler wrapper every API route uses. With `{ audit: operation }`
 * it also writes the request's audit row; see the header of this module.
 */
export const withErrorHandling = createErrorHandling(recordWithDatabase);
