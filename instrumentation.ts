/**
 * Next.js instrumentation: the application log's view of the server process.
 *
 *   - `register()` logs `app.started` once each time a server process
 *     initialises -- once per process and per restart, so PM2 restarts and any
 *     second process each produce their own line, told apart by `pid`.
 *   - `onRequestError()` logs `next.request_error` for an error Next itself
 *     caught: a page or layout that threw while rendering, or anything that
 *     escaped a Route Handler. API handlers catch and log their own errors in
 *     `withErrorHandling` (`lib/apiHandler.ts`), so a request is not logged
 *     twice.
 *
 * WHAT THIS DOES NOT DO. Next prints such an error to stderr itself, in full
 * and unredacted, *before* it calls `onRequestError`, and offers no supported
 * way to stop or change that under `next start` (verified in Next 16.3.1:
 * `RouteModule.onRequestError` and `createReactServerErrorHandler` both call
 * `console.error` first). This file adds a structured, redacted, correlated
 * line beside Next's own; it does not replace or clean Next's. That residual
 * exposure is an accepted decision -- see `memory/dec_log.md` (M12 S2).
 *
 * Node.js runtime only: the logger needs `AsyncLocalStorage` and
 * `process.stdout`, so it is imported only after the runtime check. Its import
 * carries the file extension, like `lib/log.ts`'s own, so the bare-Node
 * self-check can load this file.
 */

import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { log } = await import("./lib/log.ts");
  // Deliberately nothing about configuration: no versions, URLs or settings.
  log.info("app.started", { component: "app" });
}

/**
 * The errors already logged, and for which requests.
 *
 * One render can report the same error object more than once: the layout and
 * the page each await the same failed promise -- `getPool()` hands every
 * caller the one connection attempt -- so the same error is thrown in two
 * components. Next prints it once and silences the repeat, but still calls
 * this hook each time (seen on a production build).
 *
 * Keyed by the object, so a different error is always logged. Per request id,
 * so requests that share one failure each get their line -- concurrent
 * requests awaiting one failed connection attempt do share it, and their
 * reports interleave, so remembering only the last id would not do. Weak, so
 * the map never keeps an error alive.
 *
 * Bounded, because an error object can outlive its requests: a rejection
 * cached somewhere and rethrown to every request would otherwise collect every
 * id it ever met. Only the most recent `MAX_REQUESTS_PER_ERROR` ids are kept
 * per error. The cost is in the safe direction: a request whose id has been
 * pushed out by that many others reporting the same object can log a second
 * line; no report is ever silenced wrongly.
 *
 * A report with no request id is always logged: there is nothing to tell its
 * request apart from any other by, and a missing line costs more than a
 * repeated one.
 */
const MAX_REQUESTS_PER_ERROR = 32;
const reported = new WeakMap<object, string[]>();

/** True unless this error has already been logged for this request. */
function firstReport(error: unknown, requestId: string | undefined): boolean {
  if (requestId === undefined) return true;
  if (typeof error !== "object" || error === null) return true;
  const recent = reported.get(error) ?? [];
  if (recent.includes(requestId)) return false;
  recent.push(requestId);
  if (recent.length > MAX_REQUESTS_PER_ERROR) recent.shift();
  reported.set(error, recent);
  return true;
}

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const [{ log }, { isRequestId, REQUEST_ID_HEADER }, { routeLabel }] = await Promise.all([
      import("./lib/log.ts"),
      import("./lib/requestId.ts"),
      import("./lib/apiHandler.ts"),
    ]);
    // The proxy's id, if this request went through it; never a fresh one,
    // which would correlate with nothing.
    const header = request.headers[REQUEST_ID_HEADER];
    const requestId = typeof header === "string" && isRequestId(header) ? header.toLowerCase() : undefined;
    if (!firstReport(error, requestId)) return;

    log.error("next.request_error", {
      requestId,
      component: "next",
      // Next's own pattern for the route (`/events/[id]`), never the URL.
      route: routeLabel(context.routePath),
      method: request.method,
      reason: context.routeType,
      err: error,
    });
  } catch {
    // Next reports a throw from here with `console.error`, unredacted, so
    // nothing may escape. The logger itself never throws; this covers the
    // imports.
  }
};
