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

**Page render (the common path).** `app/layout.tsx` sets the document's
language, direction and fonts — see "Language and direction" below — and wraps
everything in `ToastProvider` and `AppShell`. `AppShell` is a Server Component
that asks [lib/session.ts](../lib/session.ts) for the current user
(`getCurrentUser()`) and the switcher's personas (`listPersonas()`), which read
`db.users` in turn. Pages are Server Components too, and load what they show
through the shared server modules — `lib/session`, `lib/events` — which reach
the persistence boundary in `lib/db`; what lies beneath that is "Data layer"
below. No fetch, no API hop. Only leaves that need state or handlers become
Client Components.

```
app/layout.tsx → AppShell (server) → lib/session → lib/db
               → page (server)     → lib/session, lib/events → lib/db
```

**Client mutation.** A Client Component calls `fetchJson` from `lib/api.ts`,
which hits a route handler. The handler establishes identity itself via
`getCurrentUser()`, enforces the rules, writes through `lib/db`, and returns a
plain object. The client then refreshes the server-rendered view.

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

### Data layer — `lib/db.ts` and `lib/data/`

Data lives in SQL Server (since M6). **Server only** throughout — nothing here
is ever imported from a Client Component.

```
Server Component / Route Handler → lib/session, lib/events → lib/db.ts → lib/data/* → mssql → SQL Server
```

- **[lib/db.ts](../lib/db.ts) is the persistence boundary**, and the only
  persistence module product code imports. Pages, route handlers,
  `lib/events.ts` and `lib/session.ts` talk to `db` and know nothing about the
  driver, the tables or how an event is spread across them. It holds **no
  T-SQL**.
- **Ids and timestamps come from the application or its tooling, never the
  database**: ids are UUIDs with no database default, and no statement reads a
  server clock. At runtime `lib/db.ts` generates entity ids and record stamps
  (`createdAt`, `updatedAt`); other domain timestamps may be set elsewhere in
  the application — the reject route stamps its own `decidedAt`. Fixture ids
  and timestamps come from [lib/seed.ts](../lib/seed.ts), and migration-history
  timestamps come from the migration runner.
- **It keeps the old store's contract** where that still applies — every method
  async, a miss is `null` (or `false` for a delete), reads return fresh
  objects, and in a patch a key present with `undefined` clears the field while
  an absent key leaves it. The header of [lib/db.ts](../lib/db.ts) states the
  contract and its one deliberate exception.
- **Registration writes are narrowed on purpose.** There is no generic
  registration create, and the type the generic `registrations.update` accepts
  cannot express setting `going` or moving a row to another event or person — a
  type-level restriction, not a runtime check. At runtime a place is granted
  only through `claimSeat` and `approve` — see "Seat-taking and concurrency"
  below.
- **[lib/data/](../lib/data/) owns the SQL**: one module per concern (events,
  registrations, users), `rows.ts` for the row ↔ domain translation, and
  `seats.ts` for the seat protocol. Its T-SQL is held to the project's SQL
  Server target by `npm run check:tsql`; the contract is
  [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md).
- **Among application modules, [lib/data/client.ts](../lib/data/client.ts)
  alone reads the connection string and owns the pool's lifecycle**, and it
  carries the `server-only` marker that protects the chain above it. The
  application's data modules get their connections from it; they import
  `mssql` only for parameter type constants.
- **The database administration CLIs** — the migration runner and the
  seed/reset tool under `lib/data/`, and the read-only target check under
  `scripts/` — are not part of the application. They read the connection
  string themselves and run under bare Node with their own short-lived pools.
  Application code must not depend on them; lint rejects static imports of the
  two `lib/data/` CLIs from application code.

Fixtures — 12 events, 5 people, every state covered — are defined once in
[lib/seed.ts](../lib/seed.ts) and loaded into the database by the seed tooling.
The application reads only their fixed ids and the persona order from that file,
never the records.

**Read consistency.** An event is assembled from its row plus its co-host and
invite rows, read by separate statements, and a board is assembled from separate
event, user and registration reads. Each read sees committed data, but the
stitched aggregate is **not** a database-wide snapshot, so a concurrent change
can briefly show a mix of committed moments. The product accepts that for
rendering. It matters for writes in two different ways:

- **Capacity-sensitive writes** — taking a place, approving one — re-derive
  their decision inside the seat protocol, under the event-row lock, from state
  re-read there.
- **Every other write** — withdrawing, rejecting, editing, publishing,
  deleting — authorises from the request's own pre-write read
  (`getEventDetailForViewer`), and guards the transition itself, where there is
  one, with an expected-status compare-and-set.

The mixed-moment window is narrow today: no current product route writes co-host
or invite rows on their own — creating an event writes empty lists, and deleting
one removes them. But `db.events.update` still replaces either list when a patch
names it, so the window is not closed; do not treat a loaded aggregate as though
it were a stable snapshot or a lock.

**Errors.** In the application, one driver failure is a domain outcome: a
duplicate key in the seat claim, which the product already words as "you already
have a place". Every other driver failure — deadlock victims (1205) included —
propagates to `withErrorHandling` as a server error. The CLIs report their own
failures separately. Why a deadlock is deliberately not mapped:
[lib/data/errors.ts](../lib/data/errors.ts).

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
  `HostEventActions`, `ApprovalQueue`, `RequestDecisionActions`, and the
  `EventMeta` family (`DateBlock`, `AccessBadge`, `EventStatusBadge`,
  `RegistrationBadge`, `EventMetaLine`, `EventMetaDetails`, `CapacityMeter`).
- `layout/` — the app frame: `AppShell`, `NavLink`, `PersonaSwitcher`.

`EventCard` renders only what it is passed — deriving counts, attendees and the
viewer's own status is the caller's job. Check `/styleguide` before building
anything new; it probably already exists.

### Styling layer — `app/styles/tokens.css`

Every colour, space, radius, shadow and type size is a token, defined for light
and dark (via `prefers-color-scheme` and a `data-theme` attribute). Components
each have one `.module.css` beside them. The rules governing all of this are in
[CLAUDE.md](../CLAUDE.md). Rules that depend on reading direction have their own
conventions, in the next section.

### Language and direction — Hebrew, RTL

The product UI is Hebrew and the document is right-to-left.
[app/layout.tsx](../app/layout.tsx) sets `lang="he"` and `dir="rtl"` once on
`<html>`, and that is the only place a layout direction is declared outright: no
component hardcodes `dir="rtl"` or `dir="ltr"` of its own, and no layout is
mirrored by hand. The one `dir` a component may carry is `dir="auto"` on
free-form content, which delegates the decision to the content rather than
overriding the document — see "Free-form content" below. It is not an exception
to the convention; it is part of it.

Rubik is the interface font, loaded through `next/font` with the Hebrew *and*
Latin subsets and placed in front of Geist in `--font-sans`, so Latin inside a
Hebrew sentence keeps the same face.

The workshop scaffolding is deliberately not translated — `/` and `/styleguide`
are still English, and so are the seeded fixtures in
[lib/seed.ts](../lib/seed.ts). That is what makes the mixed-direction handling
below load-bearing rather than theoretical.

**Presentation changed; the domain did not.** Every stored value, union member,
URL query value and `ApiError` `code` keeps its English identifier —
`open`/`approval`/`invite`, `draft`/`published`/`cancelled`,
`going`/`pending`/`rejected`, the categories, the roles, `not_found`,
`forbidden`. Hebrew lives only in the display layer:
[lib/labels.ts](../lib/labels.ts) maps each value to its word, the board's
`<option value>` is still the enum member so the query string stays English, and
only an `ApiError`'s `message` is Hebrew. Do not translate an internal value
because a screen shows it in Hebrew.

**Where the words are.** [lib/labels.ts](../lib/labels.ts) owns the product's
vocabulary, and the localization moved into it the strings the product UI had
been typing into JSX — the app frame, the nav, the document title, the UI kit's
own "close" and "loading", and the API's generic refusals. Import from there
rather than writing a string into a component. The one part with its own home is
[lib/date.ts](../lib/date.ts), which owns the wording of dates, durations and
relative days; it imports `hebrewAnd` from `lib/labels.ts` so the two agree on
grammar.

The domain maps are typed against their unions (`Record<EventAccess, string>`
and so on), so a new access mode, status or category is a **compile error** until
its Hebrew label exists. That is the guarantee that the display layer cannot
quietly fall behind the domain, and it is the reason a new domain value is added
in `lib/types.ts` and `lib/labels.ts` together.

`lib/labels.ts` is a vocabulary file, not a locale bundle. The app is
single-locale: one Hebrew UI, with `he-IL` and `dir="rtl"` static, no runtime
language switch and no i18n framework or message-catalog layer anywhere in the
dependencies. That is what the product currently asks for rather than a
prohibition — but nothing here is a translation system yet, so do not write code
that assumes one.

**Counted phrases go through a helper.** Hebrew inflects one and two separately
from everything above them, so there is no equivalent of `${n} events`. Every
counted phrase is built by a small function — for example `eventCount`,
`attendeeCount`, `placeCount`, `hourCount`, `dayCount`. A new counted string
adds one of those rather than interpolating a number in front of a noun.

**Dates.** The locale is pinned to `he-IL` — still a literal, and still to stop
the server and the browser disagreeing; the header in
[lib/date.ts](../lib/date.ts) explains why. A time *range* is wrapped in
U+2066/U+2069 isolates, because an RTL paragraph otherwise resolves the neutral
dash to the paragraph direction and renders the range end-first.

**Logical CSS, not mirrored CSS.** Direction-sensitive rules use
`margin-inline-start`, `padding-inline-start`, `border-inline-start`,
`inset-inline-end` and `text-align: start`, so `dir` alone mirrors the app.
Rules that are not direction-sensitive are left alone — `Button`'s spinner keeps
`border-right-color`, because a rotating shape has no reading direction. Do not
mechanically reverse a layout that does not depend on direction. Directional
glyphs in text are *not* mirrored by `dir` and are authored for the reading
direction: `PageHeader`'s back arrow is `→`.

**Free-form content takes its own direction.** Anything a person wrote — an
event's title, summary, description, venue, address or link, a person's name or
job title, a request's message — is rendered with `dir="auto"`, and the
free-text inputs in `EventForm` carry it too. The structured controls (the
dates, the capacity, the pickers) do not.

`dir="auto"` sets the computed `direction` of the element it is placed on, and
`direction` governs the inline alignment of everything inside that element. That
is true of any container, not only a flex or grid one. So put it on **the text
run itself, rather than on a wrapper that lays out several independent lines or
items**: on a wrapper, one Latin value changes the direction context for its
siblings too, and they all align away from the document's start edge. That is
what pulled `LocationDetails`'s venue and address away from their icon.

Placement is not the only failure. Even with `dir="auto"` correctly on the text
runs, flex sizing can misplace them: a stretched column makes the short line as
wide as the long one, and a Latin value then sits at the far end of that box
rather than beside what it belongs to. A column of text next to an avatar or an
icon therefore shrink-wraps its children (`align-items: flex-start`) instead of
stretching them. When something looks wrongly spaced in RTL, the two questions
are "is `dir="auto"` on the run or on a wrapper?" and "is the box wider than its
text?".

**Typecheck, lint and build catch none of this.** A misplaced `dir="auto"` and a
stretched box both compile perfectly. Anything touching free-form text or
direction-sensitive layout is checked by looking at it, with both a Hebrew and a
Latin value in the same field — the seeded fixtures are English while the chrome
is Hebrew, so the mixed case is the one the app shows by default and costs
nothing to exercise.

## The derived layer — `lib/permissions.ts` and `lib/events.ts`

Between the store and the screens sit two modules with deliberately different
jobs. The split is what keeps authorisation reviewable in one place.

### Permission rules — `lib/permissions.ts`

`canViewEvent()`, `canManageEvent()`, `canCreateEvent()`,
`getRegistrationAvailability()` and `getRequestDecisionAvailability()` are the
single implementation of five separate questions — may this person see the
event, may they manage it, may they create one at all, may they take a place at
it, and what may a host decide about somebody else's request — called from both
pages and route handlers so no two callers can drift apart.

Two of them take something other than (event, viewer). `canCreateEvent()` takes
only a user: creation is role-based, because there is no event yet to be a host
of. `getRequestDecisionAvailability()` takes no user at all: *whether* the actor
may decide is `canManageEvent()`, and every host gets the same answer about a
given request, so folding the two together would give one rule two reasons to
say no.

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

Server-rendered, with its interactive parts pushed down to client leaves. It
resolves the viewer, asks `lib/events.ts` for that one event, and calls
`notFound()` when the answer is `null` — so a hidden event and a nonexistent one
are indistinguishable, which [TASKS.md](../TASKS.md) §4 requires. Nothing about
an event the viewer may not see is ever assembled, let alone rendered.

The page decides nothing itself. It calls `getRegistrationAvailability()` for the
viewer's state and consumes the `viewerCanManage` the loader already derived;
[components/events/RegistrationPanel.tsx](../components/events/RegistrationPanel.tsx)
is presentation only and stays a Server Component, and the host-only section is
gated on manageability and absent from the markup for everyone else — hiding it
in CSS would still ship it.

There are two host-only surfaces on the page, and they sit apart on purpose. The
**host tools** card in the aside holds the event's own actions — edit, publish,
delete. The **approval queue** is a section of the main column, above "Who is
going", because a request carries a person and a message and needs the width,
and because the queue is the part of the screen waiting on the host.

This one route serves both audiences and both modes: it is the attendee's screen,
the host's management screen, and — under `?edit=1` — the edit form. "Managing
events" and "Deciding requests" below describe that half. Which controls a given
viewer gets is manageability; current state is in [s_status.md](s_status.md).

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

That availability check is what the caller's message is based on, and it refuses
early where it can — but it runs on the snapshot the request loaded. The write
goes through `db.registrations.claimSeat`, which asks the same rule again inside
the seat protocol, and **that** answer is the authoritative one: a request that
loses the race for the last seat is refused with the same words it would have
got by arriving a moment later. Withdrawing frees a place rather than taking
one, so it is an expected-status transition that does not take the event-row
seat lock.

Registering yields `going`, or `pending` where the access mode is `approval` —
the mode decides, never the caller. A person has at most one registration per
event, so withdrawing **transitions the row to `cancelled` rather than deleting
it**, and registering again revives that same row; a revived row starts a new
cycle, so the previous cycle's decision fields and message are cleared. Nothing
here writes `waitlisted`.

```
RegistrationActions (client) → fetchJson → route handler
      ↓                                        ↓
  toast + router.refresh()          getCurrentUser() → lib/events → lib/permissions
                                                   → db.registrations.claimSeat (seat protocol)
```

[components/events/RegistrationActions.tsx](../components/events/RegistrationActions.tsx)
is the client leaf, and it holds interaction only — it picks the method, reports
what came back, and asks the server to re-render. The refresh runs after a
failure as well as a success, because a refusal usually means the page it was
clicked from is out of date, and the control stays busy until that refresh has
landed, so an action the store has already moved past cannot briefly become
clickable again. No optimistic state: the server-rendered view is the truth.

Why each of these was decided this way, including how the final-seat race was
closed: [dec_log.md](dec_log.md).

### Managing events — creating, editing, publishing, deleting

The host half of the product. Four write paths. The three that address an
existing event are authorised the same way; creating is role-based, because
there is no event to check yet:

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

Both use the same `EventForm`, and a single `mode` prop is the whole difference
between them: the endpoint and method, the submit label, the toast wording, and
where Cancel goes. Both land on the event's detail page on success. The fields
and the rules are shared, so they cannot drift between creating and editing.

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

### Deciding requests — the approval queue

The other host half. An `approval` event turns registering into a *request*, and
this is where a host resolves one.

```
POST /api/events/[id]/registrations/[registrationId]/approve   -> going
POST /api/events/[id]/registrations/[registrationId]/reject    -> rejected
```

Two routes rather than one endpoint carrying a decision, and **both read no
body**: the session says who is acting, the URL says which request, and the
route says which transition. That is the shape `publish` established, applied
again. The collection route above them stays the caller's *own* place at an
event; these item routes are a host acting on somebody else's row, so they
authorise on `canManageEvent()` rather than on registration availability — in
the order "Managing events" sets out, where missing and invisible both answer
404 before manageability is consulted.

**Who sees it.** The queue's rows are built in
[lib/events.ts](../lib/events.ts) **only when `viewerCanManage`** — everyone
else gets an empty array. Who asked, what they wrote, and whether they can still
see the event are therefore never assembled for a viewer with no business seeing
them, rather than assembled and then withheld.

**What is actionable.** The queue holds the two statuses a host can still act
on: `pending` requests, and `rejected` ones — [TASKS.md](../TASKS.md) §4 keeps a
turned-down person approvable while forbidding them to ask again. `going`,
`cancelled` and `waitlisted` rows are not a host's to decide. Approving is
therefore the only *decision* that takes a row out of the queue: an approved
person becomes a confirmed attendee and appears under "Who is going" instead.
Nothing takes a confirmed place back — see "Deliberately absent" in
[s_status.md](s_status.md). A row can also leave with no host acting at all: a
pending requester may withdraw, which sets their registration to `cancelled` —
neither of the two statuses this queue holds.

**What closes it.** A draft, a cancelled event or one that has already started
refuses both decisions, the same closure `getRegistrationAvailability()` applies
to registering and withdrawing. Capacity closes only approving, and only
approving: a full `approval` event still accepts new requests and still accepts
a rejection, but a host cannot approve past capacity — which is `TASKS.md` §4,
and is why a rejected request on a full event stays un-approvable until a seat
frees up.

**How the write is made safe.** Approving raises the `going` count, so it is a
seat claim performed by a host: the route's check words the refusal, and
`db.registrations.approve` re-reads the row and re-runs the same decision rule
inside the seat protocol, which is the answer that counts — two hosts cannot
approve into one seat. Rejecting cannot raise the count, so it is an
expected-status transition that does not take the event-row seat lock. The two
are not symmetric when they race:

- **approve first, reject second** — if reject read `pending` before the
  approval landed, its expected-status write finds `going` and conflicts; if it
  reads after, it sees `going` and the decision rule refuses. Either way reject
  cannot overwrite the approval;
- **reject first, approve second** — approval re-reads the row under the lock,
  finds it `rejected`, and the shared rule allows approving a rejected request,
  so it may legitimately move it `rejected → going` if the locked checks pass.

What holds either way: **no decision is written against a status the operation
did not read and expect.**

**A requester who has lost sight of the event.** Access changes keep every
registration row (see "Managing events"), so a request can outlive its author's
ability to see what they asked to join. The queue says so on the row and leaves
it fully actionable. It does not hide it, decide it, or touch the invite list —
so approving that person makes them `going` without restoring their access.

**Server and client.** The queue is server-rendered and derives nothing: each
row arrives from `lib/events.ts` with its decision already worked out, so the
request messages and the timestamps stay on the server. Only the pair of buttons
is a Client Component, and it receives just what acting requires — the event and
registration ids, the two booleans, and the requester's name for the buttons'
accessible labels. It follows the same path as
`RegistrationActions` — `fetchJson`, a toast carrying the server's message, then
`router.refresh()` so the server re-derives and the counts, the capacity meter
and the attendee list become true again. No optimistic state.

Why each of these was decided this way: [dec_log.md](dec_log.md).

Current position: [s_status.md](s_status.md).

## Seat-taking and concurrency

The capacity rule is a rule about seat-taking: **a seat-taking operation may add
a `going` registration only while the authoritative `going` count is below the
event's capacity, or when capacity is unlimited.** It is not a promise that the
count never exceeds capacity — see the last point below. The rule spans rows and
tables, so no database constraint can express it. **Capacity is not enforced by
the database.** It is held by an application protocol, and the distinction is
what a future change must not blur.

**What the database does guarantee**, by constraint: at most one registration
per person per event; valid enum values; a capacity that is unlimited or at
least one; an end after the start; and foreign keys that refuse to orphan a row
rather than cascading. The schema is [migrations/](../migrations/).

**What the application protocol guarantees.** At application runtime, the only
way to produce `going` is the seat protocol in
[lib/data/seats.ts](../lib/data/seats.ts), reached through
`db.registrations.claimSeat` (registering or requesting a place) and
`db.registrations.approve` (a host's decision). Lower-level `lib/data/` helpers
perform the physical write on its behalf. Each runs as one transaction that:

1. locks the event row;
2. re-reads the authoritative state under that lock — the event, the `going`
   count, the registration row;
3. re-runs the same pure rule from [lib/permissions.ts](../lib/permissions.ts)
   the route already ran, so the business rule is never restated in T-SQL;
4. writes with the row's expected status as a predicate;
5. commits, atomically, which releases the lock.

The rest of the rules around it:

- **Writes that cannot raise the count** — withdrawing, rejecting, publishing —
  do not take the event-row seat lock. They are compare-and-set transitions on
  the expected status; zero rows written means somebody else moved first, which
  routes report as a conflict.
- **Generic writes must not bypass the protocol.** The store offers no generic
  registration create, and `RegistrationUpdate` — the type
  `db.registrations.update` accepts — cannot express `going`, `eventId` or
  `userId`. That is a type-level restriction, not runtime validation: it keeps
  ordinary callers from being handed a seat-granting or re-parenting write. The
  wider internal update inside `lib/data/` exists for `seats.ts` alone; a new
  runtime statement that sets `going` anywhere else breaks the invariant and
  nothing in the database will catch it. Add it to `seats.ts` instead.
- **Lock order starts from the event side**: deleting an event takes its row
  before touching what references it, and no application transaction takes two
  event rows.
- **The seed and reset tooling is out of band.** It writes the fixtures —
  including registrations already `going` — into an empty or just-cleared
  schema, under its own safety model ([u_environment.md](u_environment.md)).
  Its write transaction takes a lock on the whole events table before it
  mutates anything, and seed checks the tables are empty under that lock; the
  schema check, and reset's before-counts, are read beforehand outside it. It
  is bootstrap, not a runtime seat claim, so the seat-taking rule does not
  apply to it.
- **Capacity lowered by a host is not a seat claim.** M4 lets a host lower
  capacity below current attendance and evicts nobody, so `goingCount >
  capacity` stays a reachable state; what the protocol prevents is a seat-taking
  operation adding to it.

Deeper detail — the lock hints, why no range lock is needed, and how the
isolation level is left alone — is in the header of
[lib/data/seats.ts](../lib/data/seats.ts) and in "The seat-claim protocol" in
[docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md).
Why the protocol replaced the race M3 accepted: [dec_log.md](dec_log.md).

## Source-of-truth locations

| Concern | Lives in |
| --- | --- |
| Identity | [lib/session.ts](../lib/session.ts) — server only |
| Persistence boundary, ids and timestamps | [lib/db.ts](../lib/db.ts) — server only |
| SQL and data access | [lib/data/](../lib/data/) — server only; connection string and pool in [lib/data/client.ts](../lib/data/client.ts) |
| The seat-claim protocol — the only runtime path that may produce `going` | [lib/data/seats.ts](../lib/data/seats.ts) |
| Schema | [migrations/](../migrations/) |
| The SQL Server target, rejected constructs and shared-database rules | [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md) — **authoritative** |
| Visibility, manageability, creation rights, registration availability and request decisions | [lib/permissions.ts](../lib/permissions.ts) — shared by pages and routes |
| Derived event context | [lib/events.ts](../lib/events.ts) — server only |
| Fixtures / personas | [lib/seed.ts](../lib/seed.ts) |
| API helpers | [lib/api.ts](../lib/api.ts) |
| API house style, worked example | [app/api/session/route.ts](../app/api/session/route.ts) |
| Registration writes, and the authorised-mutation example | [app/api/events/\[id\]/registrations/route.ts](../app/api/events/[id]/registrations/route.ts) |
| Approving and rejecting a request | [app/api/events/\[id\]/registrations/\[registrationId\]/approve/route.ts](../app/api/events/[id]/registrations/[registrationId]/approve/route.ts) · [.../reject/route.ts](../app/api/events/[id]/registrations/[registrationId]/reject/route.ts) |
| Event create / edit / publish / delete | [app/api/events/route.ts](../app/api/events/route.ts) · [app/api/events/\[id\]/route.ts](../app/api/events/[id]/route.ts) · [app/api/events/\[id\]/publish/route.ts](../app/api/events/[id]/publish/route.ts) |
| What a host may set, and the rules it must satisfy | [lib/eventInput.ts](../lib/eventInput.ts) — shared by the form and the routes |
| The create / edit form | [components/events/EventForm.tsx](../components/events/EventForm.tsx) |
| Domain model | [lib/types.ts](../lib/types.ts) |
| User-facing copy | [lib/labels.ts](../lib/labels.ts) |
| Date formatting and grouping | [lib/date.ts](../lib/date.ts) |
| Design tokens | [app/styles/tokens.css](../app/styles/tokens.css) |
| Language, direction and fonts | [app/layout.tsx](../app/layout.tsx) — `lang`, `dir` and the font variables · font stack in [app/styles/tokens.css](../app/styles/tokens.css) |
| UI kit barrel | [components/ui/index.ts](../components/ui/index.ts) |
| The approval queue, and its decision buttons | [components/events/ApprovalQueue.tsx](../components/events/ApprovalQueue.tsx) · [components/events/RequestDecisionActions.tsx](../components/events/RequestDecisionActions.tsx) |
| Event components | [components/events/](../components/events/) |
| App frame | [components/layout/](../components/layout/) |
| Live component reference | `/styleguide` in the running app |
