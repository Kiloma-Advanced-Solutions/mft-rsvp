# a_system — how the system is built

Next.js **16.3.1** App Router · React **19.2.8** · TypeScript · CSS Modules.
No Tailwind, no CSS-in-JS, no component library.

> `AGENTS.md` warns that this Next.js version has breaking changes against
> training data. Read the relevant guide in `node_modules/next/dist/docs/`
> before writing framework code. Do not write Next.js from memory.

## The layers

```
app/
  page.tsx                 start page — what is built, what is yours
  events/page.tsx          M1 · the board                    ← stub
  events/[id]/page.tsx     M2 · the detail screen            ← stub
  styleguide/              every component rendered with real data
  api/session/route.ts     the worked example of the API house style
  api/dev/reset/route.ts   reload fixtures without restarting
  styles/tokens.css        every colour, space, radius, shadow, type size
  globals.css              reset and base elements — nothing new goes here
components/
  ui/                      generic primitives; know nothing about events
  events/                  anything that understands the domain
  layout/                  app shell, nav, persona switcher
lib/
  types.ts                 the domain model — read this first
  db.ts                    async in-memory store            SERVER ONLY
  seed.ts                  12 events, 5 people              SERVER ONLY
  session.ts               getCurrentUser() — trusted identity
  api.ts                   withErrorHandling, ApiError, jsonOk, readJson, fetchJson
  labels.ts                user-facing copy
  date.ts                  formatting and grouping (toDayKey)
```

## The three boundaries that matter

### 1. Server / client

Server Components by default. `"use client"` goes on the **leaf** that actually
needs state, an effect or an event handler — never at the top of a page.

`lib/db.ts` and `lib/seed.ts` are server only. A Client Component that needs
data calls an API route; it does not import the store.

### 2. Identity

`getCurrentUser()` from `lib/session.ts` is the **only** source of identity on
the server. It reads the `eb_persona` cookie, falls back to `u-maya`, and never
returns null.

**Never take a `userId` from a request body and trust it.** The brief lists
"the client sends its own `userId` and the server believes it" as a bug they
look for. `POST /api/session` takes a `userId` — that is the *persona switcher*,
which is the one legitimate exception, and it still validates the id exists.

### 3. Authorisation

This is the decision the project is graded on. Two questions:

- *Can this person **see** this event?*
- *Can this person **manage** this event?*

Answer each in **one shared place**, and call it from both the pages and the
route handlers. Hiding a button is a UX affordance, not a permission check —
every rule is enforced in the route handler.

Visibility, from the brief:

| Event | member (not invited) | invited member | host | admin |
| --- | --- | --- | --- | --- |
| `draft`, any access | no | no | yes | yes |
| `published` + `open` | yes | — | yes | yes |
| `published` + `approval` | yes | — | yes | yes |
| `published` + `invite` | **no** | yes | yes | yes |
| `cancelled` | as if published | as if published | yes | yes |

A **host** is the event's `organizerId` or anyone in `coHostIds`. A host is not
automatically an attendee — they register like everyone else.

## The API house style

Copy `app/api/session/route.ts`. Route Handlers, **not** Server Actions — that
is deliberate, so the authorisation boundary is a single obvious layer.

- Every export wrapped in `withErrorHandling`.
- Bodies read with `readJson` (malformed JSON → 400, not 500).
- Anything the caller got wrong thrown as an `ApiError`
  (`badRequest` 400 · `forbidden` 403 · `notFound` 404 · `conflict` 409).
- Success returns a plain object via `jsonOk`.
- Failure is always `{ error: { message, code?, details? } }`.
- Client calls `fetchJson` from `lib/api.ts`, which unwraps the payload and
  throws the server's message so a component can show it directly.

## The data layer

`lib/db.ts` exposes `db.users`, `db.events`, `db.registrations` and `db.reset()`.
Every method is `async` and shaped like a real repository, so swapping in a real
database later is a change of implementation, not of every call site.

State lives in memory and resets when the dev server restarts. To reload
fixtures without restarting:

```bash
curl -X POST http://localhost:3000/api/dev/reset
```

## The fixtures

Five personas — the whole authorisation surface. `DEFAULT_USER_ID` is `u-maya`.

| Id | Person | Role | Use them to test |
| --- | --- | --- | --- |
| `u-maya` | Maya Cohen | organizer | hosting, editing, the approval queue |
| `u-daniel` | Daniel Ross | organizer | an organizer looking at *someone else's* event |
| `u-priya` | Priya Nair | member | the plain attendee experience |
| `u-tom` | Tom Alvarez | member | someone with a rejected request |
| `u-sara` | Sara Klein | admin | managing an event they do not host |

Twelve seeded events cover every state. The two that prove the visibility rules:

| Event | Access | Host | Invited | Capacity |
| --- | --- | --- | --- | --- |
| `e-leadership-offsite` | `invite` | `u-sara` | `u-maya`, `u-daniel` | 8 |
| `e-comp-review` | `invite` | `u-sara` | `u-maya` | unlimited |

Also seeded: `e-hack-day` (`draft`), `e-postmortem` (`cancelled`),
`e-oncall-training` (`approval`, capacity 3 — the full-event case).

**The canonical check:** as Priya or Tom, both invite-only events vanish from
`/events` and from the API response, and `/events/e-comp-review` returns 404.
As Maya, both appear. See [`c_conventions.md`](c_conventions.md) for the
persona sweep every change goes through.
