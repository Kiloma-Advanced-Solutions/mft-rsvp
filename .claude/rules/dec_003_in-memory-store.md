---
description: "Decision: no database — an async, deep-copying in-memory store shaped like a repository."
---

# 003 — In-memory store, no database

**Status:** settled.

## Context

The exercise is product logic, UI and authorisation, not infrastructure. A real
database would consume the available time on migrations and connection wiring
without exercising anything the project is actually about.

## Decision

`lib/db.ts` is an in-memory store held on `globalThis`, seeded from
`lib/seed.ts`. No Postgres, no ORM, no persistence.

Three properties are deliberate:

1. **Every method is async** — so replacing it with a real database is a change
   of implementation, not a change of every call site.
2. **Reads return deep copies** (`structuredClone`) — a caller mutating what it
   got back cannot corrupt the store.
3. **State lives on `globalThis`** — so it survives `next dev` hot reloads
   instead of wiping whatever you created while clicking through the app.

## Rationale

The shape is what matters, not the storage. Async + repository-shaped means the
call sites are already correct for a real database; deep copies remove a class of
bug that is genuinely confusing to debug under time pressure.

## Consequences

- **Data resets when the dev server restarts.** `POST /api/dev/reset` restores
  fixtures without a restart; that route refuses to run in production.
- `lib/db.ts` and `lib/seed.ts` are server-only. A Client Component that needs
  data calls an API route.
- Never hold a reference to something the store returned and expect writes to it
  to persist — you have a copy. Write back through `update()`.
- `db.events.remove()` deletes the event's registrations too, so nothing is
  orphaned.
