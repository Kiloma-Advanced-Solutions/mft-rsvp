---
description: "Decision: mutations go through Route Handlers, not Server Actions, so authorisation is one visible layer."
---

# 002 — Route Handlers, not Server Actions

**Status:** settled.

## Context

This project is fundamentally about authorisation: who may see an event, and who
may act on one. Next.js offers two places to put a mutation — a Server Action
co-located with the component, or a Route Handler under `app/api/`.

## Decision

All mutations go through **Route Handlers**. `app/api/session/route.ts` is the
worked example every new route follows.

## Rationale

- The authorisation boundary becomes a single obvious layer. "Is this rule
  enforced?" is answered by opening one file, not by tracing which component
  called which action.
- The API is independently testable with `curl`, which is how the visibility
  rules actually get verified — an endpoint that can be hit directly is an
  endpoint whose checks can be proved.
- It forces the client/server split to be explicit: a Client Component has no
  option but to go through an HTTP boundary, which makes "the client lies"
  impossible to forget.

## Consequences

- Client Components mutate via `fetchJson` and then call `router.refresh()` to
  re-run Server Components.
- Slightly more ceremony per mutation than a Server Action: a route file, a
  handler, and a fetch call.
- Every handler is wrapped in `withErrorHandling`, and every rule in `TASKS.md`
  §4 is enforced inside it. A check that lives only in a component is a bug.
