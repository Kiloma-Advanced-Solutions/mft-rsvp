---
description: The Route Handler house style — withErrorHandling, ApiError, readJson, jsonOk, fetchJson.
paths:
  - "app/api/**"
  - "lib/api.ts"
---

# API conventions

`app/api/session/route.ts` is the worked example. Read it before writing a new
route; every handler in the project looks like it.

Every response is one of two shapes:

```
success  ->  the payload, as-is
failure  ->  { error: { message, code?, details? } }
```

That consistency is what lets the client have one `fetchJson` helper instead of
bespoke error handling at every call site.

## Server side

```ts
export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJson<{ userId?: unknown }>(request);

  if (typeof body.userId !== "string" || body.userId.length === 0) {
    throw ApiError.badRequest("`userId` is required.");
  }

  const user = await db.users.get(body.userId);
  if (!user) throw ApiError.notFound(`No persona with id "${body.userId}".`);

  return jsonOk({ currentUser: user });
});
```

- **Every** export is wrapped in `withErrorHandling`. It turns a thrown
  `ApiError` into a clean response and anything unexpected into a 500 without
  leaking a stack trace.
- Bodies are read with `readJson` — malformed JSON becomes a 400, not a 500.
- Anything the caller got wrong is `throw ApiError.…`:
  `badRequest` (400), `forbidden` (403), `notFound` (404), `conflict` (409 — the
  request made sense but conflicts with current state).
- Success returns a plain object through `jsonOk`.
- Validate untyped input explicitly. Body fields are typed `unknown` and
  narrowed, not cast.

## Client side

`fetchJson` from `lib/api.ts` unwraps the success payload and throws an `Error`
carrying the server's message, so a component can show it directly:

```ts
try {
  await fetchJson("/api/session", { method: "POST", body: JSON.stringify({ userId }) });
  router.refresh();
} catch (error) {
  toast.error("Could not switch persona", error instanceof Error ? error.message : undefined);
}
```

`router.refresh()` after a mutation re-runs every Server Component with the new
state. Without it the page keeps showing the previous view.

## Authorisation lives here

Route Handlers, not Server Actions — deliberately, so the authorisation boundary
is a single obvious layer (`dec_002`). Every rule in `TASKS.md` §4 is enforced in
the handler. Hiding a button is a UX affordance, not a permission check; a
component-level check with no server check is the bug this project is looking
for.

Answer "can this person see this event" and "can this person manage this event"
in **one** shared place and call it from both the pages and the API — not
re-answered per file.
