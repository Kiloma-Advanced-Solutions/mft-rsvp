/**
 * What the server knows about the request it is handling: its id, and who the
 * application resolved as the actor. SERVER ONLY.
 *
 * Two holders, because route handlers and page renders give different
 * guarantees, and neither one covers both:
 *
 *   - **Route handlers** get an `AsyncLocalStorage` store, entered explicitly by
 *     `runWithRequestContext` around the handler. It is visible to everything
 *     the handler awaits and to nothing outside it, so two concurrent requests
 *     never see each other's context.
 *   - **Page renders** get a React `cache()` store. React scopes `cache` to one
 *     server render, so the layout (`AppShell`) and the page share it, and the
 *     next request starts with a fresh one. There is no wrapper around a render
 *     to enter an `AsyncLocalStorage` from, which is why a page cannot use the
 *     first holder.
 *
 * `currentRequestContext` reads the `AsyncLocalStorage` store when there is one
 * and the render store otherwise. Outside both -- a route handler nobody wrapped,
 * a module initialiser -- React's `cache` does not memoise, so every call gets a
 * fresh, empty context: writes to it are lost and reads find nothing. That is
 * the safe direction to be wrong in: a missing request id or actor, never
 * another request's.
 *
 * Nothing here decides identity. `getCurrentUser()` in `lib/session.ts` remains
 * the only source of it; `noteActor` is how it will tell this module what it
 * resolved, so the audit log can record the actor without looking the user up
 * a second time.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import { cache } from "react";

/** The actor as resolved for this request, and the snapshot the audit log keeps. */
export type ActorNote = {
  /** `Events_Users.Id`. */
  userId: string;
  /** The display name at the time of the request. */
  name: string;
  /**
   * True only when the development persona resolver fell back to the default
   * persona because the cookie was missing or named nobody.
   */
  fallback: boolean;
};

export type RequestContext = {
  requestId: string | undefined;
  actor: ActorNote | undefined;
};

function emptyContext(requestId?: string): RequestContext {
  return { requestId, actor: undefined };
}

const handlerContext = new AsyncLocalStorage<RequestContext>();

/** One per server render; see the header for why a page needs its own holder. */
const renderContext = cache((): RequestContext => emptyContext());

/**
 * Runs `work` with its own request context. For route handlers: everything
 * `work` awaits sees this context, and nothing outside it does.
 */
export function runWithRequestContext<T>(requestId: string, work: () => T): T {
  return handlerContext.run(emptyContext(requestId), work);
}

export function currentRequestContext(): RequestContext {
  return handlerContext.getStore() ?? renderContext();
}

/**
 * Runs `work` as if no request were being handled. For code that reports on
 * something no request owns -- a pool connection dropping while idle.
 *
 * Needed because `AsyncLocalStorage` follows asynchronous resources, not
 * requests: a socket opened while one request was being handled emits its
 * events in that request's context for as long as the socket lives, so
 * without this a failure an hour later would be logged under the id of
 * whichever request happened to open the connection.
 */
export function outsideRequestContext<T>(work: () => T): T {
  return handlerContext.exit(work);
}

/**
 * Records who the application resolved as the actor. The first note in a
 * request wins: a page and its layout each resolve the user, from the same
 * cookie, and a later call must not replace what an earlier one recorded.
 */
export function noteActor(
  user: { id: string; name: string },
  fallback: boolean,
): void {
  const context = currentRequestContext();
  if (context.actor !== undefined) return;
  context.actor = { userId: user.id, name: user.name, fallback };
}
