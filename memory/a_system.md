# System Map

Orientation for a session that needs to understand the shape of the app quickly.
It describes **relationships and boundaries** — who calls whom, and what must not
happen. For implementation detail, the source code is authoritative. Coding rules
live in [CLAUDE.md](../CLAUDE.md); behavioural rules in [TASKS.md](../TASKS.md) §4.

## Product shape

An internal events board with two halves:

- **Management** — people allowed to run events create, edit, publish and delete
  them.
- **Discovery** — everyone else browses the events they are allowed to see and
  registers for the ones they want.

The pivot of the product is that an event opens up in one of three **access
modes** — open, approval needed, or invite only — which decides both who can see
it and what registering does. See [d_glossary.md](d_glossary.md) for the terms and
[TASKS.md](../TASKS.md) §1 for the product statement.

Two constraints shape the design, both stated in `TASKS.md` §1:

1. **No separate edit screen.** Hosts edit an event on the event's own detail
   page; everyone gets the same screen, hosts get more of it.
2. **The board must never leak.** An invite-only event is absent from the board
   *and* from the API response for someone who was not invited. Filtering in the
   browser does not count.

## Request flow

**Page render (the common path).** `app/layout.tsx` wraps everything in
`ToastProvider` and `AppShell`. `AppShell` is a Server Component that reads the
session and the user list directly. Pages are Server Components too, and read the
store directly — no fetch, no API hop. Only leaves that need state or handlers
become Client Components.

```
app/layout.tsx → AppShell (server) → page (server) → lib/db
                                                   → lib/session
```

**Client mutation.** A Client Component calls `fetchJson` from `lib/api.ts`,
which hits a route handler. The handler establishes identity itself via
`getCurrentUser()`, enforces the rules, touches the store, and returns a plain
object. The client then refreshes the server-rendered view.

```
client leaf → fetchJson → route handler → getCurrentUser() → lib/db
                                        ↓
                              router.refresh() re-runs the server render
```

[components/layout/PersonaSwitcher.tsx](../components/layout/PersonaSwitcher.tsx)
is the existing worked example of this whole path, including the `router.refresh()`
step — without it the page keeps rendering the previous persona's view.

## Layers

### App Router pages — `app/`

Routes and composition. The default is a Server Component, with the client
boundary pushed down to the leaf that needs it — [CLAUDE.md](../CLAUDE.md) states
the rule. `/events` is the board,
`/events/[id]` the detail screen, `/styleguide` the live component reference, and
`/` the start page. Placement rules: [CLAUDE.md](../CLAUDE.md).

### Identity boundary — `lib/session.ts`

`getCurrentUser()` is the **only** source of identity on the server, and it never
returns null. A `userId` arriving in a request body is never trusted. There is no
login — identity is a persona cookie, which is what makes the rules testable; the
mechanics are in [u_environment.md](u_environment.md). See
[lib/session.ts](../lib/session.ts); the permission rules that depend on it are in
[TASKS.md](../TASKS.md) §4.

### Data layer — `lib/db.ts`

Async in-memory store, **server only** — never imported from a Client Component.
Its shape matters: every method is async, reads return deep copies, and state
lives on `globalThis` so it survives hot reload. The header comment in
[lib/db.ts](../lib/db.ts) explains why each of those choices was made. Fixtures —
12 events, 5 people, every state covered — are in [lib/seed.ts](../lib/seed.ts).

### API layer — `app/api/`

Route handlers, not Server Actions, so the authorisation boundary is one obvious
layer. Every handler is wrapped in `withErrorHandling`, reads bodies with
`readJson`, throws `ApiError` for anything the caller got wrong, and returns a
plain object on success. Client code always goes through `fetchJson`, which
unwraps the payload and throws the server's message.
[app/api/session/route.ts](../app/api/session/route.ts) is the worked example to
copy; the helpers are in [lib/api.ts](../lib/api.ts).

### Component layers — `components/`

- `ui/` — generic primitives that know nothing about events. Import from the
  barrel: [components/ui/index.ts](../components/ui/index.ts).
- `events/` — anything that understands the domain: `EventCard`, `EventGrid`, and
  the `EventMeta` family (`DateBlock`, `AccessBadge`, `EventStatusBadge`,
  `RegistrationBadge`, `EventMetaLine`, `EventMetaDetails`, `CapacityMeter`).
- `layout/` — the app frame: `AppShell`, `NavLink`, `PersonaSwitcher`.

`EventCard` renders only what it is passed — deriving counts, attendees and the
viewer's own status is the caller's job. Check `/styleguide` before building
anything new; it probably already exists.

### Styling layer — `app/styles/tokens.css`

Every colour, space, radius, shadow and type size is a token, defined for light
and dark (via `prefers-color-scheme` and a `data-theme` attribute). Components
each have one `.module.css` beside them. The rules governing all of this are in
[CLAUDE.md](../CLAUDE.md).

## Where the derived layer is missing

Two seams are deliberately unbuilt, so a fresh session does not assume it failed
to find them:

- **`EventWithContext`** exists in [lib/types.ts](../lib/types.ts) — event plus
  hosts, counts, the viewer's registration and whether they can manage it — but
  nothing constructs one yet.
- **No shared visibility/manageability helper exists.** Nothing currently answers
  "can this person see this event" or "can this person manage it". `CLAUDE.md`
  requires those answers to live in one shared place, called from both pages and
  API routes, and [TASKS.md](../TASKS.md) §10 makes it a review criterion.

Current position: [s_status.md](s_status.md).

## Source-of-truth locations

| Concern | Lives in |
| --- | --- |
| Identity | [lib/session.ts](../lib/session.ts) — server only |
| Data access | [lib/db.ts](../lib/db.ts) — server only |
| Fixtures / personas | [lib/seed.ts](../lib/seed.ts) |
| API helpers | [lib/api.ts](../lib/api.ts) |
| API house style, worked example | [app/api/session/route.ts](../app/api/session/route.ts) |
| Domain model | [lib/types.ts](../lib/types.ts) |
| User-facing copy | [lib/labels.ts](../lib/labels.ts) |
| Date formatting and grouping | [lib/date.ts](../lib/date.ts) |
| Design tokens | [app/styles/tokens.css](../app/styles/tokens.css) |
| UI kit barrel | [components/ui/index.ts](../components/ui/index.ts) |
| Event components | [components/events/](../components/events/) |
| App frame | [components/layout/](../components/layout/) |
| Live component reference | `/styleguide` in the running app |
