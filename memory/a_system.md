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

There are two worked examples.
[components/layout/PersonaSwitcher.tsx](../components/layout/PersonaSwitcher.tsx)
shows the bare path, including the `router.refresh()` step — without it the page
keeps rendering the previous persona's view.
[components/events/RegistrationActions.tsx](../components/events/RegistrationActions.tsx)
shows the same path when the mutation has to be **authorised**, and is the one to
copy for a new one; see "Registering" below.

## Layers

### App Router pages — `app/`

Routes and composition. The default is a Server Component, with the client
boundary pushed down to the leaf that needs it — [CLAUDE.md](../CLAUDE.md) states
the rule. `/events` is the board, `/events/[id]` the detail screen — which is
also where hosts manage and edit — `/events/new` the one route that exists
because there is nothing yet to edit in place, `/styleguide` the live component
reference, and `/` the start page. Placement rules: [CLAUDE.md](../CLAUDE.md).

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
copy for the house style; the helpers are in [lib/api.ts](../lib/api.ts).

For a handler that has to **authorise** before it writes, the example is
[app/api/events/\[id\]/registrations/route.ts](../app/api/events/[id]/registrations/route.ts).
It answers none of the three questions itself — identity, visibility and the
registration rules all come from the shared modules the pages use — so the only
logic that lives in the route is turning that answer into a status code. See
"Registering" below.

### Component layers — `components/`

- `ui/` — generic primitives that know nothing about events. Import from the
  barrel: [components/ui/index.ts](../components/ui/index.ts).
- `events/` — anything that understands the domain: `EventCard`, `EventGrid`,
  `BoardFilters`, `RegistrationPanel`, `RegistrationActions`, `EventForm`,
  `HostEventActions`, and the `EventMeta` family (`DateBlock`, `AccessBadge`,
  `EventStatusBadge`, `RegistrationBadge`, `EventMetaLine`, `EventMetaDetails`,
  `CapacityMeter`).
- `layout/` — the app frame: `AppShell`, `NavLink`, `PersonaSwitcher`.

`EventCard` renders only what it is passed — deriving counts, attendees and the
viewer's own status is the caller's job. Check `/styleguide` before building
anything new; it probably already exists.

### Styling layer — `app/styles/tokens.css`

Every colour, space, radius, shadow and type size is a token, defined for light
and dark (via `prefers-color-scheme` and a `data-theme` attribute). Components
each have one `.module.css` beside them. The rules governing all of this are in
[CLAUDE.md](../CLAUDE.md).

## The derived layer — `lib/permissions.ts` and `lib/events.ts`

Between the store and the screens sit two modules with deliberately different
jobs. The split is what keeps authorisation reviewable in one place.

### Permission rules — `lib/permissions.ts`

`canViewEvent()`, `canManageEvent()`, `canCreateEvent()` and
`getRegistrationAvailability()` are the single implementation of four separate
questions — may this person see the event, may they manage it, may they create
one at all, and may they take a place at it — called from both pages and route
handlers so no two callers can drift apart. `canCreateEvent()` is the one that
takes only a user: creation is role-based, because there is no event yet to be a
host of.

They are **synchronous, with no store and no session**: the caller resolves the
viewer through `getCurrentUser()` and passes it in along with any counts, which
keeps the trusted-identity boundary at [lib/session.ts](../lib/session.ts)
rather than spreading it. The one impurity is the clock — availability reads
`isPast` to decide whether an event has already started.

The rules themselves are specified in [TASKS.md](../TASKS.md) §4, which is
authoritative and is not restated here or in the module.

### Context derivation — `lib/events.ts`

**Server only.** Builds the context declared in
[lib/types.ts](../lib/types.ts) — the event plus hosts, counts, the viewer's own
registration and whether they may manage it — for a whole board of events, and
for a single one with its attendees.

The ordering is the point: **visibility is applied before any context is
derived**, so an event the viewer may not see never reaches a page or a payload
at all. This is the never-leak constraint in [TASKS.md](../TASKS.md) §1, which
M2 extended from the board to a single event, enforced structurally rather than
by remembering to filter.

The single-event loader returns **`null` for an event that is missing and for one
the viewer may not see alike**, and leaves the response to its caller. That is
what lets a page answer with a 404 while a route handler answers with an API
error, from one authorisation decision. Why: [dec_log.md](dec_log.md).

```
page (server) → getCurrentUser() → lib/events → canViewEvent() → lib/db
                                              ↓
                                   context, or null
```

### The board — `/events`

Server-rendered end to end. It asks `lib/events.ts` for what the viewer may see,
then filters, sorts and groups that already-authorised set. Filters live in the
URL, so the query string can only narrow what the viewer was already allowed to
see — never widen it.

[components/events/BoardFilters.tsx](../components/events/BoardFilters.tsx) is
the page's only client leaf. It holds no state and makes no decisions; it turns a
choice into a navigation. Why the filters work this way:
[dec_log.md](dec_log.md).

### The detail screen — `/events/[id]`

Server-rendered, with one client leaf. It resolves the viewer, asks
`lib/events.ts` for that one event, and calls `notFound()` when the answer is
`null` — so a hidden event and a nonexistent one are indistinguishable, which
[TASKS.md](../TASKS.md) §4 requires. Nothing about an event the viewer may not
see is ever assembled, let alone rendered.

The page decides nothing itself. It calls `getRegistrationAvailability()` for the
viewer's state and consumes the `viewerCanManage` the loader already derived;
[components/events/RegistrationPanel.tsx](../components/events/RegistrationPanel.tsx)
is presentation only and stays a Server Component, and the host-only section is
gated on manageability and absent from the markup for everyone else — hiding it
in CSS would still ship it.

This one route serves both audiences and both modes: it is the attendee's screen,
the host's management screen, and — under `?edit=1` — the edit form. "Managing
events" below describes that half. Which controls a given viewer gets is
manageability; what is not built yet is current state, in
[s_status.md](s_status.md).

The registration call to action acts through a client leaf, described next.

### Registering — `/api/events/[id]/registrations`

The registration write path. `POST` registers or requests a place, `DELETE`
withdraws, and both concern **the caller's own** registration and nobody else's.

The handler answers nothing itself. It takes the acting user from
`getCurrentUser()`, the event from `lib/events.ts` — which returns `null` for
missing and invisible alike, so both refuse identically and the API cannot
confirm a hidden event exists — and what the viewer may do from
`getRegistrationAvailability()`. All three are re-derived from the store on every
request, so a stale page, a re-enabled button or a hand-written `curl` all get
the same answer: **the API is authoritative, not the UI**. Nothing in the request
body influences who acts, what status results, or whether the action is allowed.

Registering yields `going`, or `pending` where the access mode is `approval` —
the mode decides, never the caller. A person has at most one registration per
event, so withdrawing **transitions the row to `cancelled` rather than deleting
it**, and registering again revives that same row; a revived row starts a new
cycle, so the previous cycle's decision fields and message are cleared. Nothing
here writes `waitlisted`.

```
RegistrationActions (client) → fetchJson → route handler
      ↓                                        ↓
  toast + router.refresh()          getCurrentUser() → lib/events → lib/permissions → lib/db
```

[components/events/RegistrationActions.tsx](../components/events/RegistrationActions.tsx)
is the client leaf, and it holds interaction only — it picks the method, reports
what came back, and asks the server to re-render. The refresh runs after a
failure as well as a success, because a refusal usually means the page it was
clicked from is out of date, and the control stays busy until that refresh has
landed, so an action the store has already moved past cannot briefly become
clickable again. No optimistic state: the server-rendered view is the truth.

Why each of these was decided this way, including the accepted capacity race:
[dec_log.md](dec_log.md).

### Managing events — creating, editing, publishing, deleting

The host half of the product. Four write paths, all authorised the same way:

```
POST   /api/events               create, always as a draft
PATCH  /api/events/[id]          the event's editable content
POST   /api/events/[id]/publish  draft -> published, no request body
DELETE /api/events/[id]          delete, taking its registrations with it
```

**Where creation and editing live.** A new event is created at its own route,
`/events/new`, because there is no detail page to edit in place until the event
exists. It arrives as a `draft` — visible to its hosts and to admins, nobody
else — and the host then lands on `/events/[id]` and continues in the ordinary
detail workflow. An *existing* event is edited **in place** on `/events/[id]`,
with edit mode carried in the URL as `?edit=1` the way the board carries its
filters. There is no separate edit route and no second management screen; the
detail page stays the canonical screen for every audience.

Both use the same `EventForm`. A single `mode` prop decides only which endpoint
to call, what the submit button says, and where success goes — so the fields and
the rules cannot drift between creating and editing.

**Shared validation.** [lib/eventInput.ts](../lib/eventInput.ts) turns untrusted
input into a valid event, and is deliberately free of the store, the session and
HTTP so the form and the route handlers can both run it. The form runs it to put
a message next to the field that caused it; the API runs it again and does not
trust the client having passed. Its rules come from the contracts documented in
[lib/types.ts](../lib/types.ts) and nothing else — notably `summary`'s "around
110 characters" is guidance for whoever writes one, shown as a form hint, and is
**not** enforced anywhere.

**Authorisation.** Identity from `getCurrentUser()`, visibility from
`lib/events.ts`, manageability from `canManageEvent()` — the same answers the
pages get, re-derived from the store on the request that writes. The order is
the security property, and it runs before any request body is read: an event
that is missing and one the viewer may not see both answer **404**, so these
endpoints cannot be used to discover that somebody else has a draft; only then
does a viewer who can see the event but not manage it get **403**. Creating is
role-based rather than per-event, so `canCreateEvent()` answers it and refuses
with a 403. Host controls in the UI are affordances; they are absent from the
markup for everyone else, but the refusal that matters is the handler's.

**What a host may change.** `PATCH` accepts nine content fields — title,
summary, description, start, end, location, category, capacity and access.
Everything else is **absent from the parser**, so `status`, `accent`,
`organizerId`, `coHostIds` and `invitedUserIds` cannot be reached by any request
body; the store owns `id` and the timestamps. The protection is that the field
does not exist there, not that it is checked.

**Lifecycle.** Publishing is its own bodyless route rather than a `status` field
on `PATCH`, which is what keeps the content editor free of lifecycle logic.
`draft -> published` is the only transition the product performs.

**Accent** is assigned by the server when the event is created and is not
host-editable. It is a tint on the board card and date block, invisible on the
event's own page, and carries no domain meaning.

**Capacity.** `null` means unlimited. Over the API: `capacity: null` is
unlimited, omitting it on create is unlimited too, and omitting it on `PATCH`
keeps whatever is stored. In the form it takes ticking "no limit" — a blank
number box is a validation error rather than a silent removal of the event's
limit, so clearing the field to retype it cannot uncap the event by accident.
Lowering capacity below the number already `going` is allowed and removes
nobody; the event simply reads as full.

**Location** is one value. Supplying it on a `PATCH` replaces the whole object,
and fields that are not meaningful to the chosen `kind` are dropped, so an event
moved from hybrid to online cannot keep a stale street address. Omitting it
keeps what is stored.

**Registrations survive edits.** Changing access keeps every registration row —
including when switching to `invite`, which removes visibility for people not on
the invite list while leaving their rows intact. Deleting is the deliberate
exception: `db.events.remove()` removes the event's registrations along with it,
which is why the UI puts a confirmation in front of it that names how many
confirmed places and pending requests go too. The dialog is an affordance; the
`DELETE` handler is what authorises and performs the deletion.

Current position: [s_status.md](s_status.md).

## Source-of-truth locations

| Concern | Lives in |
| --- | --- |
| Identity | [lib/session.ts](../lib/session.ts) — server only |
| Data access | [lib/db.ts](../lib/db.ts) — server only |
| Visibility, manageability, creation rights and registration availability | [lib/permissions.ts](../lib/permissions.ts) — shared by pages and routes |
| Derived event context | [lib/events.ts](../lib/events.ts) — server only |
| Fixtures / personas | [lib/seed.ts](../lib/seed.ts) |
| API helpers | [lib/api.ts](../lib/api.ts) |
| API house style, worked example | [app/api/session/route.ts](../app/api/session/route.ts) |
| Registration writes, and the authorised-mutation example | [app/api/events/\[id\]/registrations/route.ts](../app/api/events/[id]/registrations/route.ts) |
| Event create / edit / publish / delete | [app/api/events/route.ts](../app/api/events/route.ts) · [app/api/events/\[id\]/route.ts](../app/api/events/[id]/route.ts) · [app/api/events/\[id\]/publish/route.ts](../app/api/events/[id]/publish/route.ts) |
| What a host may set, and the rules it must satisfy | [lib/eventInput.ts](../lib/eventInput.ts) — shared by the form and the routes |
| The create / edit form | [components/events/EventForm.tsx](../components/events/EventForm.tsx) |
| Domain model | [lib/types.ts](../lib/types.ts) |
| User-facing copy | [lib/labels.ts](../lib/labels.ts) |
| Date formatting and grouping | [lib/date.ts](../lib/date.ts) |
| Design tokens | [app/styles/tokens.css](../app/styles/tokens.css) |
| UI kit barrel | [components/ui/index.ts](../components/ui/index.ts) |
| Event components | [components/events/](../components/events/) |
| App frame | [components/layout/](../components/layout/) |
| Live component reference | `/styleguide` in the running app |
