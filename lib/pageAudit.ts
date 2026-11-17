/**
 * The page-view half of the audit log (M12 S5). SERVER ONLY.
 *
 * Three pages are audited -- the board, an event's detail page and the
 * create form -- one row per render, written with Next's `after()` once the
 * response has been sent, so a reader never waits for it (decision D4).
 * Refreshes and client-side navigations are renders and get a row; prefetches
 * do not. Everything else -- `AppShell`'s lookups, the `/` redirect, the
 * generic not-found page -- writes nothing.
 *
 * HOW A PAGE USES IT. The first statement of the page:
 *
 *   const audit = await beginPageAudit("event.view");
 *
 * registers the write and starts with the outcome `error`, so a render that
 * throws before deciding anything is recorded as one. The page then states
 * what happened before it renders or calls `notFound()`: `audit.success()`,
 * `audit.notFound()` or `audit.denied()`. The detail page also passes the
 * `[id]` it was given (`audit.forEvent(id)`); an id that is not a UUID turns
 * `notFound()` into `invalid` with reason `invalid_id`, while a missing, hidden
 * or deleted event stays `not_found` -- deliberately not told apart, as the
 * page's 404 does not tell them apart either.
 *
 * WHY EVERYTHING IS READ UP FRONT. Inside an `after()` callback registered by
 * a Server Component, `headers()` and `cookies()` throw, and the render's
 * React `cache()` store -- where `getCurrentUser()` notes the actor -- is no
 * longer reachable. So `beginPageAudit` reads the request id and the prefetch
 * headers while the page is rendering, and keeps a reference to the render's
 * request-context object; the callback reads the actor from that object, by
 * then filled in by whichever of `AppShell` and the page resolved the user
 * first.
 *
 * PREFETCHES. In this application a router prefetch does not run a page at
 * all -- there is no `loading.tsx` and no partial prerendering, so Next answers
 * a prefetch with the route tree only. The prefetch headers are still checked
 * here, so that a prefetch that did reach a page would write nothing.
 *
 * THE ROW. Route patterns come from a fixed table, never from the URL; the
 * metadata only from values the page has already parsed (the board's section
 * and filters, the detail page's `view`), never from a raw query string. The
 * HTTP status is the one that outcome produces -- 200, 404 for `not_found`,
 * `invalid` and `denied` (all three are the page's 404), 500 for `error` --
 * because the callback cannot see the response.
 *
 * KNOWN LIMITATION (decision D-S5-3). An outcome is set before the page's
 * child components render. If one of them then throws, the row keeps
 * `success` although the reader got an error page. The application log's
 * `next.request_error` for that request, with the same request id, is the
 * record of the failure.
 *
 * The write itself is `db.audit.record` (decision D15): never throws, never
 * longer than its deadline. With file extensions on its imports, and Next and
 * the database loaded only on first use, so the bare-Node self-check
 * (`scripts/check-logging.mts`) can load this module.
 */

import type { AuditInput, AuditMetadata, AuditOperation, AuditOutcome } from "./audit.ts";
import { errorKind, log } from "./log.ts";
import { currentRequestContext } from "./requestContext.ts";
import { requestIdFrom } from "./requestId.ts";

/** The audited pages, by operation, with the route pattern each row names. */
export const PAGE_AUDIT_ROUTES = {
  "board.view": "/events",
  "event.view": "/events/:id",
  "event.create_form.view": "/events/new",
} as const satisfies Partial<Record<AuditOperation, string>>;

export type PageAuditOperation = keyof typeof PAGE_AUDIT_ROUTES;

/** The headers a router prefetch carries (Next 16, `app-router-headers`). */
export const PREFETCH_HEADERS = ["next-router-prefetch", "next-router-segment-prefetch"] as const;

/** The outcomes a page can have: never `rejected`, which is an API's 409. */
type PageAuditOutcome = Exclude<AuditOutcome, "rejected">;

/** The status each page outcome produces. */
export const PAGE_STATUS: Record<PageAuditOutcome, number> = {
  success: 200,
  not_found: 404,
  invalid: 404,
  denied: 404,
  error: 500,
};

/** What a page may add to its row; nothing else reaches `Metadata`. */
type PageAuditDetails = {
  /** The board section shown. */
  section?: string;
  /** The board's parsed filter values. */
  filters?: Record<string, string>;
  /** On the detail page: `host` when the management lists rendered, `edit` in edit mode. */
  view?: "host" | "edit";
};

/** The page's handle on its row. Every method is safe to call more than once; the last call wins. */
type PageAudit = {
  /** The detail page's `[id]`, as given. */
  forEvent(id: string): void;
  success(details?: PageAuditDetails): void;
  notFound(): void;
  denied(): void;
};

/** What the page helper needs from Next and the database, injected so it can be checked without them. */
export type PageAuditDeps = {
  /**
   * Registers the callback with Next's `after`. Awaited by `beginPageAudit`,
   * so the callback is registered while the page is still rendering.
   */
  after: (callback: () => Promise<void>) => void | Promise<void>;
  /** Next's `headers()`. */
  readHeaders: () => Promise<{ get(name: string): string | null }>;
  /** `db.audit.record`. */
  record: (input: AuditInput) => Promise<unknown>;
  /**
   * Throws `error` again if it is one of Next's own control-flow signals --
   * Next's `unstable_rethrow`, which also knows the ones that carry no
   * `digest` (a React postpone) or arrive as another error's `cause`.
   */
  rethrowNextSignal?: (error: unknown) => void | Promise<void>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Does nothing: what a prefetch, or a second call in one render, gets. */
const NO_AUDIT: PageAudit = {
  forEvent() {},
  success() {},
  notFound() {},
  denied() {},
};

export function createPageAudit(deps: PageAuditDeps) {
  /**
   * Never fails the page for an audit problem: if the row cannot even be
   * registered, the page renders unaudited and the failure is logged, as a
   * failed write would be. Next's own control-flow signals -- such as a
   * dynamic-rendering bailout -- are passed on untouched, because Next
   * decides how to render from them: anything carrying a `digest`, and
   * anything Next's `unstable_rethrow` recognises.
   */
  return async function beginPageAudit(operation: PageAuditOperation): Promise<PageAudit> {
    try {
      return await register(deps, operation);
    } catch (error) {
      if (isNextSignal(error)) throw error;
      await deps.rethrowNextSignal?.(error);
      log.error("audit.write_failed", {
        component: "audit",
        op: operation,
        reason: "writer_bug",
        err: errorKind(error),
      });
      return NO_AUDIT;
    }
  };
}

/** A Next.js control-flow error: every one carries a string `digest`. */
function isNextSignal(error: unknown): boolean {
  return typeof error === "object" && error !== null && typeof (error as { digest?: unknown }).digest === "string";
}

async function register(deps: PageAuditDeps, operation: PageAuditOperation): Promise<PageAudit> {
  const occurredAt = new Date();
  const startedAt = performance.now();
  const headers = await deps.readHeaders();

  if (PREFETCH_HEADERS.some((name) => headers.get(name) !== null)) return NO_AUDIT;

  // The render's own context object, kept so the callback can read the
  // actor after the render's `cache()` scope has ended. One row per render:
  // a second call in the same render gets a handle that writes nothing.
  const context = currentRequestContext();
  if (context.audit.recorded) return NO_AUDIT;
  context.audit.recorded = true;

  const requestId = requestIdFrom(headers as Headers);
  // A render's context starts with no id -- only an API handler's is entered
  // with one -- so a line logged later in this render would carry none. Give
  // it the id the row and the response carry. Never replace one it has.
  context.requestId ??= requestId;
  let outcome: PageAuditOutcome = "error";
  let reasonCode: string | null = null;
  let eventParam: string | undefined;
  let details: PageAuditDetails = {};

  await deps.after(async () => {
    try {
      const durationMs = Math.round(performance.now() - startedAt);
      const metadata: AuditMetadata = { ...details };
      if (context.actor?.fallback) metadata.actorFallback = true;
      await deps.record({
        occurredAt,
        requestId,
        actor: context.actor === undefined ? null : { userId: context.actor.userId, name: context.actor.name },
        channel: "page",
        httpMethod: "GET",
        route: PAGE_AUDIT_ROUTES[operation],
        operation,
        eventId: eventParam !== undefined && UUID.test(eventParam) ? eventParam.toLowerCase() : null,
        subject: null,
        outcome,
        httpStatus: PAGE_STATUS[outcome],
        reasonCode,
        durationMs,
        metadata,
      });
    } catch (error) {
      // `db.audit.record` never throws; this is the step above it failing.
      // The fields every audit failure line carries, and no actor.
      log.error("audit.write_failed", {
        requestId,
        component: "audit",
        op: operation,
        reason: "writer_bug",
        err: errorKind(error),
      });
    }
  });

  return {
    forEvent(id) {
      eventParam = id;
    },
    success(given = {}) {
      outcome = "success";
      reasonCode = null;
      details = {};
      if (given.section !== undefined) details.section = given.section;
      if (given.filters !== undefined && Object.keys(given.filters).length > 0) details.filters = { ...given.filters };
      if (given.view !== undefined) details.view = given.view;
    },
    notFound() {
      details = {};
      if (eventParam !== undefined && !UUID.test(eventParam)) {
        outcome = "invalid";
        reasonCode = "invalid_id";
      } else {
        outcome = "not_found";
        reasonCode = null;
      }
    },
    denied() {
      outcome = "denied";
      reasonCode = null;
      details = {};
    },
  };
}

/**
 * Starts the audit row for this page render. The first statement of an
 * audited page; see the header of this module.
 */
export const beginPageAudit = createPageAudit({
  after: async (callback) => {
    const { after } = await import("next/server");
    after(callback);
  },
  readHeaders: async () => {
    const { headers } = await import("next/headers");
    return headers();
  },
  record: async (input) => {
    const { db } = await import("./db.ts");
    return db.audit.record(input);
  },
  rethrowNextSignal: async (error) => {
    // If even the import fails, the `digest` check above has already run;
    // the original failure is still the one logged.
    let rethrow: ((error: unknown) => void) | undefined;
    try {
      ({ unstable_rethrow: rethrow } = await import("next/navigation"));
    } catch {
      return;
    }
    rethrow(error);
  },
});
