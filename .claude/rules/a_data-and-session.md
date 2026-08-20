---
description: The in-memory store, the seed fixtures, and how identity works on the server.
paths:
  - "lib/**"
---

# Data and session

## Server only

`lib/db.ts`, `lib/seed.ts` and `lib/session.ts` are **server only**. Never import
them from a Client Component — client code talks to API routes. `lib/types.ts`,
`lib/labels.ts`, `lib/date.ts`, `lib/cx.ts` and `lib/api.ts`'s `fetchJson` are
safe on both sides.

## The store

`lib/db.ts` is an in-memory store standing in for a database:

- Every method is **async**, so swapping in a real database later is a change of
  implementation, not a change of every call site.
- Reads return **deep copies** (`structuredClone`), so a caller mutating what it
  got back cannot corrupt the store.
- State lives on `globalThis.__eventsBoardStore` so it survives `next dev` hot
  reloads.

Shape: `db.users.{list,get}`, `db.events.{list,get,create,update,remove}`,
`db.registrations.{list,find,create,update,remove}`, `db.reset()`.
`db.events.remove()` also deletes that event's registrations — orphans would
otherwise show up in "my events" forever. `db.registrations.find(eventId,
userId)` exists because a person has at most one registration per event.

Data resets when the dev server restarts. To reload fixtures without a restart:

```bash
curl -X POST http://localhost:3000/api/dev/reset
```

## The fixtures

`lib/seed.ts` — 12 events, 5 people. Timestamps are computed relative to "now"
the first time the store is created, so the board always has a sensible
past/present/future spread. The spread is deliberate: every access mode, every
event status, a full event, a past event, a draft, a cancellation, and all five
registration statuses. If you change the fixtures, keep that coverage.

## Identity

`getCurrentUser()` in `lib/session.ts` is **the only source of identity on the
server**. It reads the `eb_persona` cookie (`SESSION_COOKIE`), falls back to the
default persona when the cookie is missing or stale, and therefore never returns
null — callers never handle a logged-out state.

Never take a `userId` from a request body and trust it. Assume the client lies.

`setCurrentUser()` writes the cookie, and can only be called from a Route
Handler or Server Function — not from a page or layout.

## Dates

`lib/date.ts` pins the locale to `en-GB` on purpose — see
`dec_005_pinned-en-gb-locale.md`. The `relative*` helpers read the clock, so they
belong in Server Components or in an effect; calling them during a client render
can drift from what the server produced. `toDayKey()` groups by **local** day —
`toISOString()` would shift an evening event into the next day.
