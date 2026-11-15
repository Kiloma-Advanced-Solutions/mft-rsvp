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
 * Exactly one line per failed request, and none for a successful one.
 *
 * With file extensions on its imports, like `lib/log.ts`, so the bare-Node
 * self-check (`scripts/check-logging.mts`) can load it.
 */

import { ApiError, jsonError } from "./api.ts";
import { API_ERRORS } from "./labels.ts";
import { log, type LogFields } from "./log.ts";
import { runWithRequestContext } from "./requestContext.ts";
import { newRequestId, requestIdFrom } from "./requestId.ts";

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
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return (...args: Args) => {
    const request = args[0] instanceof Request ? args[0] : undefined;
    const requestId = request ? requestIdFrom(request.headers) : newRequestId();

    return runWithRequestContext(requestId, async () => {
      const startedAt = performance.now();
      try {
        return await handler(...args);
      } catch (error) {
        if (error instanceof ApiError) {
          if (error.status >= 500) {
            log.warn("api.service_failure", {
              ...requestFields(request, startedAt),
              status: error.status,
              reason: error.code,
            });
          }
          return jsonError(error.status, error.message, {
            code: error.code,
            details: error.details,
          });
        }
        log.error("api.unhandled_error", {
          ...requestFields(request, startedAt),
          status: 500,
          err: error,
        });
        return jsonError(500, API_ERRORS.internal, { code: "internal" });
      }
    });
  };
}
