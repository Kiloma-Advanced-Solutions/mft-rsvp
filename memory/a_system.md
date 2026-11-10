# System Map

Orientation for a session that needs to understand the shape of the app quickly.
It describes **relationships and boundaries** — who calls whom, and what must not
happen. For implementation detail, the source code is authoritative. Coding rules
live in [CLAUDE.md](../CLAUDE.md); behavioural rules in [TASKS.md](../TASKS.md) §4.

## Product shape

An internal events board with two halves:

- **Management** — people allowed to run events create, edit, publish, cancel
  and delete them, decide the requests on them, remove and restore their
  attendees, decide who is invited to them, and share them — by copying the
  event's link or emailing it to people who can already see it.
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
also where hosts manage and edit — and `/events/new` the one route that exists
because there is nothing yet to edit in place. `/` has no page of its own: it
redirects to `/events`. The frame's navigation is a rail at the inline start —
the board, and `/events/new` for whoever may create — which becomes a top bar
with the brand and the persona on a narrow screen; see
[dec_log.md](dec_log.md). Placement rules: [CLAUDE.md](../CLAUDE.md).

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
  only through `claimSeat`, `approve` and `restore` — see "Seat-taking and
  concurrency" below.
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

**Deletion is soft (C5).** `dbo.Events_Events.DeletedAt` (`datetime2(3)`,
nullable, migration `0003`) is `NULL` for a live event and stamped, together
with `UpdatedAt`, from the application's clock when the event is deleted.
Nothing else is written: the event's registrations, co-hosts and invitations
stay exactly as they were. A deleted event is treated as nonexistent at the
data layer, which is what makes it nonexistent everywhere above it:

- **Every statement that reads an event row filters `DeletedAt IS NULL`** — the
  board list, the single-event read, the seat claim's locked read and the bare
  event-row lock, all in [lib/data/events.ts](../lib/data/events.ts). Pages and
  routes therefore give a deleted event the same 404 as a missing one, admins
  included; the seat protocol and the invitation writes see it as gone.
  **A new event read must carry the same filter.** Reads of child rows that are
  not scoped to one event — the co-host, invite and registration lists the board
  loads — need none, because their rows are only ever attached to events that
  came through the filtered read.
- **`DeletedAt` never reaches `EventRecord`.** There is no "deleted" status and
  no domain field; a deleted event is simply absent.
- **Writes refuse a deleted event as well as reads.** `updateEvent` requires
  `DeletedAt IS NULL` in its predicate; the registration update requires a live
  parent in the same statement; and every write that touches an event's
  registrations takes the event-row lock first — see "Seat-taking and
  concurrency".
- **Nothing restores or purges.** A development reset still hard-deletes every
  row, deleted events included.

Cancelling and deleting are different things: a cancelled event is a live
event in its terminal `cancelled` status, still visible to whoever could see
it; a deleted event is visible to nobody.

**Read consistency.** An event is assembled from its row plus its co-host and
invite rows, read by separate statements, and a board is assembled from separate
event, user and registration reads. Each read sees committed data, but the
stitched aggregate is **not** a database-wide snapshot, so a concurrent change
can briefly show a mix of committed moments. The product accepts that for
rendering. It matters for writes in four different ways:

- **Capacity-sensitive writes** — taking a place, approving one, restoring a
  removed attendee — re-derive their decision inside the seat protocol, under
  the event-row lock, from state re-read there.
- **Invitation writes** — inviting and revoking — are not capacity-sensitive,
  but they re-derive their decision too: under the same event-row lock, from
  the event and invite list re-read there. See "Managing invitations" below.
- **Registration transitions** — withdrawing, rejecting, removing an attendee
  — authorise from the request's own pre-write read
  (`getEventDetailForViewer`), then write inside a short transaction that takes
  the event-row lock first and guards the row with an expected-status
  compare-and-set. They re-run no rule under the lock: the lock is there to
  order them against a soft delete of the event (C5).
- **Every other write** — editing, publishing, cancelling, deleting —
  authorises from the request's own pre-write read, and guards the transition
  itself, where there is one, with an expected-status compare-and-set on the
  event row, which also requires the event not to be deleted.

The mixed-moment window is narrow today. No product route writes co-host rows
on their own. Invite rows are written one person at a time by the invitation
routes, and only under the event-row lock, so a write that reads the list under
that lock sees a stable one — but a page render takes no lock, and can still
read a list that is changing. `db.events.update` also still replaces either
list when a patch names it, though no current caller does. Do not treat a
loaded aggregate as though it were a stable snapshot or a lock.

**Errors.** In the application, one driver failure is a domain outcome, in two
places: a duplicate key in the seat claim, which the product already words as
"you already have a place", and a duplicate key on an invite row, which is
answered as "already invited". Every other driver failure — deadlock victims
(1205) included — propagates to `withErrorHandling` as a server error. The CLIs report their own
failures separately. Why a deadlock is deliberately not mapped:
[lib/data/errors.ts](../lib/data/errors.ts).

### API layer — `app/api/`

Route handlers, not Server Actions, so the authorisation boundary is one obvious
layer. Every handler is wrapped in `withErrorHandling`, reads bodies with
`readJson`, throws `ApiError` for anything the caller got wrong, and returns a
plain object on success. Client code always goes through `fetchJson`, which
unwraps the payload and throws the server's message — as a `RequestError`,
an ordinary `Error` that also carries the HTTP status, for the caller that has
to tell a stale page (4xx) from a failed service behind the route (5xx).
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
  `BoardFilters`, `BoardSectionNav`, `RegistrationPanel`, `RegistrationActions`,
  `EventForm`,
  `HostEventActions`, `ApprovalQueue`, `RequestDecisionActions`,
  `AttendeeList`, `AttendeeActions`, `InvitationList`, `InvitationActions`,
  `ShareEventActions` (`ShareMenu` and its email dialog), and the
  `EventMeta` family (`DateBlock`, `AccessBadge`, `EventStatusBadge`,
  `RegistrationBadge`, `ViewerRegistrationBadge`, `EventMetaLine`,
  `EventMetaDetails`, `CapacityMeter`), and `EventBackdrop`, the board's
  decorative illustration.
- `layout/` — the app frame: `AppShell` (the navigation rail, or the top bar on a
  narrow screen), `RailLink` and `PersonaSwitcher`.

`EventCard` renders only what it is passed — deriving counts, attendees and the
viewer's own status is the caller's job. Check these three directories before
building anything new; it probably already exists.

**One choice, two modes.** `SegmentedControl` and `Chip` each come in a
**link** mode, for a choice that lives in the URL — the board's access and
category filters, marked with `aria-current` — and a **radio** mode, for a
choice in a form: a visually hidden native radio inside each segment or chip,
so the browser supplies the keyboard (one tab stop per group, the arrow keys
in the reading direction) and submits the checked value under its `name`.
A set of radios is not one control, so it sits in a `Field` with `group`, a
`<fieldset>` whose `<legend>` names it, rather than in `Field`'s usual
`<label>`. That fieldset is also the set's `role="radiogroup"`, and carries
`aria-invalid` while the field has an error, so the one group a screen reader
meets has both the name and the state; the segment track and the chip row
inside it are only layout. Each radio points at the field's hint or error
through `messageId`. The event form is the radio modes' only user.

**The sliding choice.** In both modes the segmented control's navy pill is
[components/ui/SegmentIndicator.tsx](../components/ui/SegmentIndicator.tsx),
an `aria-hidden` client piece inside the track, which slides it to a new
choice over `--transition-base`. It measures the chosen option, since the
options are not always equal — the board's links are as wide as their labels
and sit two by two on a phone, the form's stack into a column — and a measured
position is right in either reading direction. Only a change of choice slides;
a resize, a breakpoint or the web font arriving puts it straight in place —
except while a slide is under way, when a resize that comes with the choice
(a section link turning heavier) moves where the slide is heading instead of
cutting it short. Until it has placed itself — before hydration, or without
JavaScript — the chosen option draws its own background, and the track's
`data-indicator` then hands that over, so there are never two.
`SegmentedControl` itself stays renderable from a Server Component. Reduced
motion is the global rule's.

`SegmentIndicator` only measures; what it draws is the caller's CSS. The
board's section navigation, `BoardSectionNav`, uses the same piece for the
navy underline under the current section, in its own `<nav>`, from its own
stylesheet — the links and their semantics are unchanged.

### Styling layer — `app/styles/tokens.css`

Every colour, space, radius, shadow and type size is a token, defined for light
and dark (via `prefers-color-scheme` and a `data-theme` attribute). Components
each have one `.module.css` beside them. The rules governing all of this are in
[CLAUDE.md](../CLAUDE.md). Rules that depend on reading direction have their own
conventions, in the next section.

An event's colour comes from its **category**: `tokens.css` maps each category
to one tone of the tinted scale (`--category-<category>-bg|fg|dot`), and
`categoryToneClass()` in `components/events/EventMeta.tsx` applies it. It tints
the board card's date tile and category label and the category filter's dots.
`EventRecord.accent` is still stored and still assigned on creation, but
nothing renders it any more. Why: [dec_log.md](dec_log.md).

### Language and direction — Hebrew, RTL

The product UI is Hebrew and the document is right-to-left.
[app/layout.tsx](../app/layout.tsx) sets `lang="he"` and `dir="rtl"` once on
`<html>`, and that is the only place a layout direction is declared outright: no
component hardcodes `dir="rtl"` or `dir="ltr"` of its own, and no layout is
mirrored by hand. The one `dir` a component may carry is `dir="auto"` on
free-form content, which delegates the decision to the content rather than
overriding the document — see "Free-form content" below. It is not an exception
to the convention; it is part of it. Email is not part of this document at all:
it is a separate rendering target that declares its own direction — see
"Email" below.

Rubik is the interface font, loaded through `next/font` with the Hebrew *and*
Latin subsets and first in `--font-sans`, with only system faces behind it, so
Latin inside a Hebrew sentence keeps the same face. Geist Mono is loaded for
monospaced text alone.

The seeded fixtures in [lib/seed.ts](../lib/seed.ts) are deliberately not
translated — their titles, names and venues are still English. That is what
makes the mixed-direction handling below load-bearing rather than theoretical.

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
glyphs are *not* mirrored by `dir` and are authored for the reading
direction: the breadcrumb trail's separator is the `chevronLeft` icon, pointing
onward in RTL.

**Free-form content takes its own direction.** Anything a person wrote — an
event's title, summary, description, venue, address or link, a person's name or
job title, a request's message — is rendered with `dir="auto"`, and the
free-text inputs in `EventForm` carry it too. The structured controls (the
dates, the capacity, the pickers) do not.

**Free-form content can be one long word.** Nothing stops a title or a name
being typed without spaces, and such text must never widen the page. Where it
is shown whole — the detail page's title, summary and description, and a
checkbox label such as a name in the invite or share picker — it carries
`overflow-wrap: anywhere`; the board card's two-line title and summary carry it
too, so the clamp's ellipsis can appear. A person's name and job title in
`Person` stay on one line and truncate, capped at their column with
`max-width: 100%`, and the name carries a `title` with the full text.

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

### Email — `emails/`, `lib/emails/`, `lib/services/`

Added by M10 for sharing an event. Email is rendered and sent on the server;
`lib/services/` is marked `server-only`. Three parts with separate jobs:

- **Presentation** — [emails/](../emails/). `BaseEmail/` is the shell every
  email is rendered in, adapted from the organization's reference email
  implementation; `eventShareEmail.tsx` is the one template. They are React
  Email components rendered to HTML on the server, not pages, and they build no
  URL and read no environment.
- **Content** — [lib/emails/](../lib/emails/). `toEventShareEmailContent()`
  builds one content object, and both the HTML template and the plain-text
  part (`buildEventShareEmailText()`) are made from it, so the two cannot say
  different things.
- **Delivery** — [lib/services/](../lib/services/). `sendMail()` in
  `emailService.ts` is the organization's transport: one JSON `POST` to
  `${MAIL_SERVICE_URL}/sendMail` with the sender, recipients, subject and both
  parts, a caller-supplied timeout, and every expected failure *returned* as a
  result rather than thrown. The sender is the Events Board system, read from
  configuration on every send with no default. `sendEventShareEmail()` in
  `lib/services/emails/sendEventShareEmail.ts` checks the recipient address,
  renders, and hands both parts to `sendMail()`. Neither decides who may send
  or receive — that is the route's, below.

**Email is a separate rendering target**, built for Outlook 2016, which renders
HTML with Word's engine. That is why the templates are nested tables with inline
style objects of literal hex colours and pixel sizes, not tokens and CSS
Modules — the exception [CLAUDE.md](../CLAUDE.md) scopes to `emails/` — and why
images are `data:` URIs in `emails/images/`, generated by
[scripts/base64convertor.mts](../scripts/base64convertor.mts). The message is
Hebrew: `BaseEmail` declares `lang="he"` and `dir="rtl"` on `<Html>` and again
on its header tables, and the printed URL carries `dir="ltr"` — declarations of
the email's own, which the app's "no component hardcodes `dir`" convention above
does not govern. Its dates come from the `formatEmail*` functions in
[lib/date.ts](../lib/date.ts), pinned to the Asia/Jerusalem time zone: the
screens' formatters use the process's own zone, which is wrong for a message
rendered on a server in UTC and read elsewhere. The rules for each are
in the headers of `emails/BaseEmail/BaseEmail.tsx` and
`emails/BaseEmail/BaseEmailStyles.ts`.

**The look is M11's on the organization's structure** (M11 PR 5): a compact
navy header with the header label and the logo, a separate card that `BaseEmail`
opens with the email's `title` above a divider, and a footer line under the
card. The colours are the M11 tokens' values written as literals. Rounded
corners are progressive enhancement, square in Outlook. The one `<style>` block
adds a narrow-screen media query to the MSO resets. Its `em-*` classes only
override values that are already inline, so a client that ignores it shows the
620px layout. The event-share email has an access note only for open and
invite-only events; an approval event has none, in the HTML and in the plain
text.

`npm run email:preview` serves the templates locally; see
[u_environment.md](u_environment.md).

## The derived layer — `lib/permissions.ts` and `lib/events.ts`

Between the store and the screens sit two modules with deliberately different
jobs. The split is what keeps authorisation reviewable in one place.

### Permission rules — `lib/permissions.ts`

`canViewEvent()`, `canManageEvent()`, `canCreateEvent()`,
`getRegistrationAvailability()`, `getRequestDecisionAvailability()`,
`getCancellationAvailability()`, `getAttendeeRemovalAvailability()`,
`getAttendeeRestoreAvailability()`, `getInvitationListAvailability()`,
`getInvitationAvailability()`, `getInvitationRevocationAvailability()` and
`getSharingAvailability()` are the single implementation of twelve separate
questions — may this person see the event, may they manage it, may they create
one at all, may they take a place at it, what may a host decide about somebody
else's request, may the event be cancelled right now, may a host take this
confirmed place back, may a host give this removed one back, may anybody be
added to the invite list right now, may this person be, may this person's
invitation be revoked, and may the event be shared right now — called from both
pages and route handlers so no two callers can drift apart.

Beside them sit the schedule rules: `getScheduleAvailability()` (may this
event's dates still change) and `checkEventSchedule()` (may it be written with
these dates), with `isStartInFuture()` as the one piece the form mirrors. Unlike
the rest they take `now` from the caller instead of reading the clock, so a
request decides against a single reading — see "Managing events" below.

Nine of the twelve take something other than (event, viewer). `canCreateEvent()`
takes only a user: creation is role-based, because there is no event yet to be
a host of. The other eight take no *actor*: *whether* the actor may decide,
cancel, remove, restore, invite, revoke or share is `canManageEvent()`, and
every host gets the same answer about a given row or event, so folding the two
together would give one rule two reasons to say no.
`getRequestDecisionAvailability()`, `getCancellationAvailability()` and
`getAttendeeRestoreAvailability()` take no user at all, which is what lets the
seat protocol re-run the decision and restore rules inside its transaction;
`getInvitationListAvailability()` and `getSharingAvailability()` take none
either, being about the event alone. `getAttendeeRemovalAvailability()`
and `getInvitationAvailability()` do take a user — the *target* — because
someone who may manage the event is neither removable this way nor a
meaningful invitee. `getInvitationRevocationAvailability()` takes only the
target's id: nothing about who they are decides it, only whether they are on
the list. The invitation writes re-run their rules under the event-row lock,
just as the seat protocol re-runs its own.

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
That visibility gate is `getEventForViewer()`, which returns the event alone,
or `null`; the detail loader goes through it, and so does a route that needs
only the event — the share-email route — so neither loads context it would
throw away, and the two cannot disagree about who sees what.

```
page (server) → getCurrentUser() → lib/events → canViewEvent() → lib/db
                                              ↓
                                   context, or null
```

### The board — `/events`

Server-rendered end to end: the data, the filtering, the sections and the URL
state are all decided on the server, and no board data reaches client code.
It asks `lib/events.ts` for what the viewer may see, then filters that already-authorised set and sorts it
into three sections: **upcoming** (not started, soonest first), **cancelled**
(the ones not yet started soonest first, then the started ones most recent
first) and **past** (started, most recent first). Cancelled is grouping only:
every cancelled event the viewer may see is still there. `isPast` — the
start — is the boundary, as it is for closing registration.

Only the selected section's cards are rendered. The section navigation,
[components/events/BoardSectionNav.tsx](../components/events/BoardSectionNav.tsx),
always shows all three with their counts, a zero included. The counts are
computed on the server from the filtered, authorised set, so a count — like a
card — can never reveal an event the viewer cannot see. Cards in the cancelled
and past sections are not dimmed; their pills carry the state.

The board's state is in the URL: `category`, `access` and `section`
(`cancelled` or `past`; upcoming is the default). The query string can only
narrow what the viewer was already allowed to see — never widen it.
[lib/board.ts](../lib/board.ts) parses it (anything unknown, empty or repeated
is the default) and builds each state's one canonical URL — parameters in that
order, defaults omitted, so the unfiltered upcoming board is plain `/events`.
[components/events/BoardFilters.tsx](../components/events/BoardFilters.tsx) and
the section navigation are links built from the whole current state, so
changing a filter keeps the section, changing the section keeps the filters,
and clearing the filters keeps the section. Every one of these links replaces
the history entry and keeps the scroll position; only restoring focus (below)
may move it, and only on a screen too short to show the section navigation.

An empty section explains itself: under filters, it offers the other sections
that have matches, with their counts, and clearing the filters; without
filters, an empty cancelled or past section offers the way back to upcoming
when upcoming has events. When nothing matches in any section — or the viewer
can see nothing at all — one board-level empty state replaces them.

**Two client pieces, for navigation only.** Neither filters, fetches nor
decides anything about the board's data; the links inside both are rendered by
the server as before.

- [components/ui/QueuedNavigation.tsx](../components/ui/QueuedNavigation.tsx)
  wraps the filters, the section navigation and the section. Each link's
  `href` is built from the state the page was rendered with, so a second click
  before the first navigation commits would follow an outdated link and undo
  the first choice. While a navigation to `/events` is pending it holds
  further board-link clicks, in order, and replays each on its link once the
  page has re-rendered, when that `href` is current. That needs a lasting link
  to keep its element across the navigation, so board links are keyed by what
  they stand for — an access option by its value, a chip by its category, a
  section by its name — never by their `href`. A held link that is gone
  by then — a jump out of an empty section, a clear link — is replayed through
  a remaining link with the same `data-nav-intent` (`lib/board.ts`): a section
  through that section's link, a clear through any clear link still shown, or
  not at all once no filters are left. Event cards and other routes are not
  held, and a navigation that has not committed after ten seconds no longer
  holds anything.
- [components/ui/FocusRestoringNav.tsx](../components/ui/FocusRestoringNav.tsx)
  is the section navigation's `<nav>`. Those empty-state links and the filters'
  clear link navigate to a board on which they no longer exist, which would
  drop focus to the document body. After the board's URL changes, and only if
  focus was dropped, it moves focus to the current section's link — without
  the browser's default scroll, then scrolling only as far as it takes to
  bring the link into view if it is off-screen. On a narrow screen, where the
  shell's bar is pinned to the top, the section links' `scroll-margin` of the
  bar's height plus `--space-2` keeps the link and its focus ring below the
  bar. It holds no state and never takes focus on first render or from an
  element that still has it.

The access filter's sliding pill and the section navigation's sliding
underline (see "The sliding choice") are client code too, but presentation
only. Each follows the server-rendered `aria-current`, so it moves when a
navigation commits — with the results, never ahead of them — and a click
`QueuedNavigation` holds moves it only once replayed. The cards and the
section's content are not animated.

**The illustration.** Behind the board, and only the board, is a decorative
drawing of an invitation and of planning an event:
[components/events/EventBackdrop.tsx](../components/events/EventBackdrop.tsx),
a Server Component of static inline SVG that reads no data, so it can reveal
nothing. It covers the shell's `<main>`, which is positioned for it but is
not a stacking context, at `z-index: -1`, and it lines its art up with the
content column through the shell's `--shell-padding-*` tokens. It is hidden from
assistive technology, ignores the pointer, and is hidden in forced colours and
in print. At phone width it becomes one small mark in the corner above the
page action.

Why the board works this way: [dec_log.md](dec_log.md).

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

**Attendance once nobody can join.** An event that is cancelled or has started
(`isPast`, so one in progress too) shows attendance as a plain headcount —
`closedAttendanceLabel()` on the board card, never "full", "be the first" or
places left. On the detail page a started event shows that headcount in place
of the capacity meter. A cancelled event otherwise keeps its own detail-page
presentation: no meter and no headcount in the registration panel.
Presentation only — what is open or closed is still decided by
`lib/permissions.ts`.

**Attendance includes the hosts (C6).** Every count a screen shows — the card,
the meter, the headcount, the badge on "Who is going" — is `attendanceCount`:
the event's hosts plus everyone `going`. Since the organizer always counts, it
is never zero, so no screen has an empty-attendance state any more: no "be the
first", no "nobody has registered", no empty "Who is going". "Who is going"
lists the hosts first — organizer, then co-hosts — then everyone `going`, in
registration order.

**A host's panel is read-only (C6).** For a viewer who hosts the event —
`isHost()`, not whichever closure `getRegistrationAvailability()` happened to
report — the registration panel becomes a participation panel titled
"משתתפים": the attendance (the meter, or a headcount once the event is past or
cancelled), no status badge, no action, and no note — except on a draft,
cancelled or past event, which keeps a short line saying so, worded without
registration (`hostParticipationNote()` in [lib/labels.ts](../lib/labels.ts)).
Everyone else keeps the registration panel unchanged.

**Layout (M11 PR 3).** Breadcrumbs — the board, then the event, then "edit" in
edit mode — replace the back link. The title and summary are centred on the
whole header, with the category above them and the badges below; `PageHeader`
does this under its opt-in `centerTitle`, which moves the actions up to the
category's line so they never take width from the title. Below the header,
the registration panel comes first in the document, so on a narrow screen it
follows the header directly; from 921px a two-column grid places it in a
sticky side column, with the main column's section cards — when and where,
about, hosts, then the host lists and who is going — beside it. The desktop
width is the shell's 1120px column, unchanged by M11.

**Edit mode (M11 PR 4).** The header keeps the breadcrumbs, the category, a
centred title and the event-level badges (access, status), but not the
viewer's own registration badge — editing the event is not about where the
viewer stands — and has no description and no host actions. The form takes
the place of both columns; see "Managing events" below.

**The viewer's own status.** The badge saying where the viewer stands — on
their board card, in the detail header and in the registration panel — is
`ViewerRegistrationBadge`, which shows nothing for `removed` and `rejected`
in any event state. Those are a host's past decision, and next to a closed
panel they would read as its reason; the panel's action and note say what the
viewer can do. Presentation only: the stored status, availability and every
rule are unchanged, and host views — the queue, the removed group, the
invitation list — show every status through `RegistrationBadge`.

There are four host-only surfaces on the page, and they sit apart on purpose.
The **header actions** (`HostEventActions`, in `PageHeader`'s actions slot)
are the event's own: Publish for a draft, an Edit link, a Share menu — copy
the link and email it, or a disabled item whose note says why sharing is
closed; see "Sharing events" below — and a More menu holding Cancel and
Delete, each still confirmed through its dialog. Share and More are
`ActionMenu`s from the kit: a menu button whose items are actions, opening
towards the trigger's roomier side and kept inside the screen. They are
absent in edit mode, where the form is the page. Cancel is offered only where
`getCancellationAvailability()` says so, the same rule the cancel route
applies. The **approval queue** is a section of the main column, above "Who is
going", because a request carries a person and a message and needs the width,
and because the queue is the part of the screen waiting on the host. The
**host's attendee list** is "Who is going" itself, served in a host's version:
the same section with a remove action beside each confirmed attendee the host
may currently remove, and the removed people in a group of their own — see
"Managing attendees" below. The **invitation list** sits below "Who is going"
in the main column: who may see the event comes after who is coming to it — see
"Managing invitations" below.

This one route serves both audiences and both modes: it is the attendee's screen,
the host's management screen, and — under `?edit=1` — the edit form. "Managing
events", "Deciding requests", "Managing attendees", "Managing invitations" and
"Sharing events" below describe that half.
Which controls a given viewer gets is manageability; current state is in
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

That availability check is what the caller's message is based on, and it refuses
early where it can — but it runs on the snapshot the request loaded. The write
goes through `db.registrations.claimSeat`, which asks the same rule again inside
the seat protocol, and **that** answer is the authoritative one: a request that
loses the race for the last seat is refused with the same words it would have
got by arriving a moment later. Withdrawing frees a place rather than taking
one, so it is not a seat claim: it is an expected-status transition that takes
the event-row lock first only to be ordered against a soft delete — a delete
that committed first makes it a 404 that writes nothing.

Registering yields `going`, or `pending` where the access mode is `approval` —
the mode decides, never the caller. A person has at most one registration per
event, so withdrawing **transitions the row to `cancelled` rather than deleting
it**, and registering again revives that same row; a revived row starts a new
cycle, so the previous cycle's decision fields and message are cleared. Nothing
here writes `waitlisted`.

**Hosts are refused (C6).** A host takes part by role and holds no
registration, so `getRegistrationAvailability()` closes with reason `host` for
anyone who hosts the event — after the draft, cancelled and started closures,
which still say so to hosts, and before everything else. Registering, requesting
and withdrawing all answer 409 with that note. `claimSeat` re-runs the same rule
after it has locked the event row and read its hosts in the same transaction,
so the refusal does not depend on the snapshot the route loaded. An admin who
does not host the event is not a host and registers normally.

A `rejected` or `removed` row is revived the same way, but only while the
event's access is `open`; on `approval` and `invite` it stays closed and only a
host can bring the person back. While that exception applies, the panel offers
the ordinary register button, with no note and without the person's old
status badge (see "The viewer's own status" above); an open register or
request button carries no note at all (`registrationCtaCopy` in
[lib/labels.ts](../lib/labels.ts)), while the registered and closed states
keep theirs. A changed access mode registers nobody by itself.

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

### Managing events — creating, editing, publishing, cancelling, deleting

The host half of the product. Five write paths. The four that address an
existing event are authorised the same way; creating is role-based, because
there is no event to check yet:

```
POST   /api/events               create, always as a draft
PATCH  /api/events/[id]          the event's editable content
POST   /api/events/[id]/publish  draft -> published, no request body
POST   /api/events/[id]/cancel   published -> cancelled, no request body
DELETE /api/events/[id]          soft delete: the event ceases to exist for everyone
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

**The form's layout (M11 PR 4).** Both pages have breadcrumbs and a centred
title — the create page its description centred under it — and the form is
four section cards: the details (title, summary, description; untitled, as the
form always was), then "מתי", "איפה" and "מי יכול להיכנס", each headed like a
detail-page section. Location type and access are segmented choices, access
with its icons, and category is a row of colour-dot chips — the kit's radio
modes (see "Component layers"), submitting under the same names and values
the selects they replaced did, so nothing downstream of the form changed. A
field with an error marks its control `aria-invalid`; locked dates show a lock
beside their reason; a whole-form refusal from the server is a tinted notice
above the actions. On a phone the segments stack and the primary action
stretches beside Cancel, in source order. Switching the location type, or
ticking and unticking "no limit", slides the height of the fields it shows
(`useHeightTransition` in the form) rather than jumping: the fields are still
swapped at once and the ones that no longer apply leave the DOM as before, and
the inline height is only there while it slides. The "no limit" checkbox stays
outside the sliding wrapper, so its focus ring is never clipped.

**Shared validation.** [lib/eventInput.ts](../lib/eventInput.ts) turns untrusted
input into a valid event, and is deliberately free of the store, the session and
HTTP so the form and the route handlers can both run it. The form runs it to put
a message next to the field that caused it; the API runs it again and does not
trust the client having passed. Its rules come from the contracts documented in
[lib/types.ts](../lib/types.ts) and nothing else — notably `summary` has **no**
length limit: not in the form, the parser, the API or the schema. The board
card line-clamps a long one, and the form's hint only says it is the short
description the card shows.

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
does not exist there, not that it is checked. Who is invited changes only
through the invitation routes, one person at a time — see "Managing
invitations" below.

**Lifecycle.** Each transition is its own bodyless route rather than a `status`
field on `PATCH`, which is what keeps the content editor free of lifecycle logic.
The product performs two: `draft -> published` and `published -> cancelled`.
Both are expected-status compare-and-set writes to the event row alone, so of
two requests that read the same status only one moves it. Cancelling is further
gated by `getCancellationAvailability()` — published and not yet started — read
before the write, and `cancelled` is terminal: nothing moves an event out of it.
A cancelled event can still be edited and deleted — its dates excepted, which
stay as they were — and because `PATCH` cannot reach `status`, editing it never
changes its status. Cancelling leaves every
registration row as it was; the event's status is what closes registering,
withdrawing and deciding, through the shared rules that close on it.

**Deleting is not a lifecycle transition.** It sets no status: it stamps
`DeletedAt` (see "Data layer"), after which every read treats the event as
nonexistent — a cancelled event stays visible, a deleted one is visible to
nobody, admins included. Any event can be deleted, at any status and any date,
by whoever may manage it. `db.events.remove()` takes the event-row lock first
and stamps the row only if it is still live, so a second delete is a 404.

**Deleted is 404, stale is 409.** Editing, publishing and cancelling write the
event row with `DeletedAt IS NULL` in the predicate, so a delete that commits
between the route's read and its write leaves the update affecting nothing.
The route then asks `eventExists()` in [lib/events.ts](../lib/events.ts) —
the ordinary filtered read — and answers 404 if the event is gone and the
existing 409 if it is still there and its status moved first. These writes
touch the event row itself, the row the soft delete also writes, so the row's
own lock orders the two.

**Dates.** Whether a start or end may change is a lifecycle question, so it is
answered in [lib/permissions.ts](../lib/permissions.ts), not by the parser:
`checkEventSchedule()` takes the stored event (or none, on create), the dates
that would be written and the server's `now`, and judges only a date that
changes — a new start must be later than now, and a published event that has
started or a cancelled one keeps both dates. `POST` and `PATCH` run it after
parsing and answer a 400 with field errors; publishing a draft whose start has
passed is a 409. The rules are in [TASKS.md](../TASKS.md) §4 "Scheduling".
Before it runs, `parseEventBody` keeps the stored value wherever a `PATCH`
sends a date in the same minute, since the form cannot express seconds, so
"unchanged" there is exact and nothing can move a locked date by seconds. The
detail page asks `getScheduleAvailability()` and passes the answer to the form,
which disables the two date inputs with the reason as their hint and leaves them
out of the request; it validates them as the exact stored timestamps, not the
minute-rounded values the inputs display, so a start and end seconds apart in
the same minute do not read as an end before the start. The form also refuses a
changed start that is not in the future against the browser's clock, sets the
start picker's minimum when it is focused, and shows the server's field errors
— carried on `RequestError` — beside their fields.

**Accent** is assigned by the server when the event is created and is not
host-editable. It is a tint on the board card and date block, invisible on the
event's own page, and carries no domain meaning.

**Capacity.** `null` means unlimited. Over the API: `capacity: null` is
unlimited, omitting it on create is unlimited too, and omitting it on `PATCH`
keeps whatever is stored. In the form it takes ticking "no limit" — a blank
number box is a validation error rather than a silent removal of the event's
limit, so clearing the field to retype it cannot uncap the event by accident.
Capacity is measured against attendance — the hosts plus everyone `going`
(C6). Lowering it below current attendance, even below the number of hosts, is
allowed and removes nobody; the event simply reads as full.

**Location** is one value. Supplying it on a `PATCH` replaces the whole object,
and fields that are not meaningful to the chosen `kind` are dropped, so an event
moved from hybrid to online cannot keep a stale street address. Omitting it
keeps what is stored.

**Registrations survive edits.** Changing access keeps every registration row —
including when switching to `invite`, which removes visibility for people not on
the invite list while leaving their rows intact. Deleting keeps them too —
since C5 the rows stay in the database — but takes every one of them out of
reach with the event, so from the user's side the places and requests are
lost. That is why the UI puts a confirmation in front of it that first states,
in bold, the attendance — hosts included — and any pending requests
separately, and then says the event is removed for every user and cannot be
restored. The cancel confirmation opens with the same line. Both dialogs are
affordances; the `DELETE` and cancel handlers are what authorise and act.

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
turned-down person approvable while forbidding them to ask again, unless the
event is now `open`, where they may register on their own. `going`,
`cancelled`, `waitlisted` and `removed` rows are not a host's to decide.
Approving is therefore the only *decision* that takes a row out of the queue:
an approved person becomes a confirmed attendee and appears under "Who is
going" instead. Taking a confirmed place back is not a decision on a request
but a capability of its own — see "Managing attendees" below. A row can also
leave with no host acting at all: a pending requester may withdraw, which sets
their registration to `cancelled` — neither of the two statuses this queue
holds — and a rejected person on an `open` event may register, which sets it
to `going`.

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
approve into one seat. Rejecting cannot raise the count, so it is not a seat
claim: it is an expected-status transition that takes the event-row lock first
only to be ordered against a soft delete, and re-runs no rule under it. The two
are not symmetric when they race:

- **approve first, reject second** — if reject read `pending` before the
  approval landed, its expected-status write finds `going` and conflicts; if it
  reads after, it sees `going` and the decision rule refuses. Either way reject
  cannot overwrite the approval;
- **reject first, approve second** — approval re-reads the row under the lock,
  finds it `rejected`, and the shared rule allows approving a rejected request,
  so it may legitimately move it `rejected → going` if the locked checks pass.
- **approve against the person registering again on an `open` event** — both
  are seat claims, so they serialise on the event-row lock and each re-reads the
  row under it. The second finds the row already `going` and its rule refuses:
  the request is no longer decidable, or the person is already in. The loser
  gets a 409 through that refusal, not through the stale-write path.

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

### Managing attendees — removing and restoring

The third part of the host half. Rejecting turns down somebody who asked;
removing takes back a place somebody already had, so it is its own capability
with its own rule rather than a third decision on a request.

```
POST /api/events/[id]/registrations/[registrationId]/remove    going -> removed
POST /api/events/[id]/registrations/[registrationId]/restore   removed -> going
```

The same shape as `approve` and `reject` beside them: **no body**, the session
says who is acting, the URL says which registration, and the route says which
transition. The order of refusals is theirs too — 404 for a missing or
invisible event, 403 for a viewer who may not manage it, 404 for a row that is
not this event's, then 409 when the transition's own rule says no. A target who
may manage the event is a 409, not a 403: the caller may remove people, just
not this one.

**The rules.** `getAttendeeRemovalAvailability()` and
`getAttendeeRestoreAvailability()` close on a draft, a cancelled event and one
that has already started, like every other availability rule. Removing needs a
`going` row whose person may not manage the event; it never consults capacity.
Restoring needs a `removed` row and a seat — capacity closes it, as it closes
approving.

**The current access mode wins.** Both are closed on an `open` event, where a
host has no say over who attends. On `approval` and `invite` events a removed
person may not register again on their own — `getRegistrationAvailability()`
answers `removed` — so a host's restore is the only way back. Once an event is
`open`, the same rule lets them through, and they register through the ordinary
flow under its ordinary closures, including a full event. One way back per
mode.

**Who sees it.** The host's rows — registration ids, availability, and who was
removed — are built in [lib/events.ts](../lib/events.ts) as `managedAttendees`
**only when `viewerCanManage`**, exactly like the queue's; everyone else gets
an empty array, and the page hands `AttendeeList` `null` and renders the plain
list. The one client leaf, `AttendeeActions`, receives an id, a name and what
it may do.

**Hosts in the host's list (C6).** The host's version lists the hosts first —
the organizer, then the co-hosts, from the `hosts` the page already holds — as
plain rows with no remove or restore action, since they hold no registration
to act on; then the `going` rows, in registration order, each with whatever
the rule allows; then the removed group. `managedAttendees` itself is still
only registration rows. The badge is `attendanceCount`, so it matches the rows
above the removed group.

**How the writes are made safe.** Removing lowers the `going` count, so it
cannot overfill an event: it is an expected-status transition from `going`,
not a seat claim — it takes the event-row lock first only to be ordered against
a soft delete. Restoring raises the count, so it is the third
seat claim — `db.registrations.restore` locks the event row, re-counts,
re-runs `getAttendeeRestoreAvailability()` and writes only if the row is still
`removed`. Two restores, or a restore and anybody else taking the last seat,
cannot both succeed.

**The cycle survives.** Both change the status and refresh `updatedAt`, and
leave the rest of the row alone. `message`, `decidedBy` and `decidedAt` belong
to the request that got the person in, so a restored person returns to the
cycle they were removed from. A removed person registering again
on an `open` event goes through `claimSeat` instead, which — as for any revived
row — starts a new cycle and clears them.

**Invitations are not touched.** Neither route writes the invite list. On an
invite-only event a removed person keeps their invitation, can still see the
event, and sees that they were removed. Restoring grants a place, not
visibility. Every host row — `going` and `removed` alike — carries whether the
person can still see the event (`attendeeCanView`, from `canViewEvent()`), and
a row whose person cannot is flagged and stays actionable, the same way the
queue treats a requester who lost sight of the event. The way to give such a
person their access back is an invitation — see the next section.

Removing asks first through `ConfirmDialog`, because getting the place back
depends on a seat still being free; restoring does not.

Why each of these was decided this way: [dec_log.md](dec_log.md).

### Managing invitations — inviting and revoking

The fourth part of the host half. An invitation decides who may *see* an
invite-only event; it is not a registration and not a seat.

```
POST   /api/events/[id]/invitations/[userId]   invite this person   -> 201
DELETE /api/events/[id]/invitations/[userId]   revoke their invitation
```

An invitation is one `(event, person)` row that exists or does not, so it is
addressed by that pair and created or deleted there, rather than through verb
routes. **No body**: the session says who is acting, the URL says which event
and which person, and the method says which change. `[userId]` is the *target*,
never the actor. The order of refusals is `remove` and `restore`'s — 404 for a
missing or invisible event, 403 for a viewer who may not manage it — then 404
for a target who is not a person in the product, and 409 when the rule says no.

**Invitation and registration stay separate.** Inviting writes no
registration: the person can now see the event and registers through the
ordinary flow. Revoking deletes the invite row alone — whatever registration
the person holds keeps its status, and a `going` place keeps counting against
capacity. Capacity plays no part in either. A confirmed attendee who has lost
sight of the event is flagged on the host's attendee list, not resolved; see
[s_status.md](s_status.md) "Known limitations" for what that leaves them able
to do.

**The rules.** `getInvitationListAvailability()` asks whether anybody may be
added: only while access is `invite`, open on a draft, closed once the event is
cancelled or has started. `getInvitationAvailability()` asks that first, then
refuses a target who may manage the event or is already on the list.
`getInvitationRevocationAvailability()` needs `invite` access and the person
on the list, and nothing else — revoking is not closed by the lifecycle. On any
other access the list is **dormant**: kept exactly as it was, read-only, and
counting again if the event goes back to `invite`.

**Who sees it.** The detail loader builds `invitations` — who is on the list,
each one's registration status (read, never written), what may be done about
each, and the **candidates** who may be added — **only when
`viewerCanManage`**, and leaves it `null` for everyone else, an invitee
included. `null` rather than the queue's empty array, because an empty list is
meaningful to a host. The candidates are worked out by the same rule the route
runs, so the picker offers nobody the server would refuse — but they are a
projection of the rule, not the authority; the route asks again.

**How the writes are made safe.** `db.events.invite` and
`db.events.revokeInvitation` change one row, never the whole list — the list
replacement in `db.events.update` would let two hosts overwrite each other. Each
runs as one transaction that locks the event row with the seat claim's own
statement, reads the event and its invite list under that lock, re-runs the
same rule the route ran, and writes. They are **not seat claims** — they write
no registration and read no count — but sharing the lock means a seat claim,
which holds it while it reads the invite list, never decides on a list that is
changing. A duplicate key on the invite row is answered as "already invited",
and a revoke that deletes nothing as "not invited", rather than as a server
error or a silent success.

**Server and client.** `InvitationList` is a Server Component that derives
nothing; it renders nothing at all on an event that is not invite-only and has
no dormant rows. Its one client leaf, `InvitationActions`, holds the picker and
the revoke buttons, and receives ids, names and job titles — never the event or
anybody's email. The picker is a dialog in which a host ticks several people
and invites them, but it sends **one per-person request at a time** through
the same route, best effort: a refusal for one does not stop or undo the
others, one toast sums up the batch, and the view refreshes once after the
last. The dialog closes when every invitation went through, stays open with
only the refused people still ticked when any did not, and cannot be
dismissed while a batch is going out. Revoking always asks first.

Why each of these was decided this way: [dec_log.md](dec_log.md).

Current position: [s_status.md](s_status.md).

### Sharing events — copy link and email

The fifth part of the host half, added by M10. Sharing hands somebody the
event's **share link** and changes nothing: no invitation, registration,
request or seat is written, and there is no schema change.

```
POST /api/events/[id]/share-emails/[userId]   email this person the link -> { sent: true }
```

**The link.** `buildEventShareUrl()` in [lib/shareLinks.ts](../lib/shareLinks.ts)
is the one place it is built: `<EVENTS_APP_BASE_URL>/events/<id>`. The origin is
configuration, never the request's `Host` header, and only a bare `http`/`https`
origin is accepted. When it is missing or unusable the function returns `null`,
and the Share menu says sharing is unavailable — the rest of the page is
unaffected, and nothing falls back to another origin. Because the link is the
canonical URL, whoever opens it is answered by `canViewEvent()` as if they had
typed it: an invite-only event stays a 404 for anyone not on its list.

**The rule.** `getSharingAvailability()` closes sharing on a draft, a cancelled
event and one that has started, and nothing else; *who* may share is
`canManageEvent()`. On the detail page, `shareState()` asks it on the server
and hands the header's `ShareMenu` either the finished URL and the recipients
while it is open, or the sentence naming the reason — or the "unavailable"
note when the base URL is not configured — which the menu shows as a disabled
item's note.

**Copy Link.** `ShareMenu` is a client leaf handed the finished URL; it builds
none and reads no `window.location`. Copying changes no server state, so it
does not refresh the page. If the clipboard is refused — a denied permission,
or an origin that is not a secure context — it says so and opens a dialog with
the URL in a read-only field to copy by hand.

**Who can be emailed.** The detail loader builds `shareRecipients` **only when
`viewerCanManage`**, and leaves it `null` for everyone else: every user
`canViewEvent()` admits, minus the viewer — on an invite-only event, its
invitees, hosts and admins — and empty while sharing is closed. The picker
receives ids, names and job titles, never an address. It is a projection of the
rules, not the authority: the route asks again.

**The route.** **No body**: the session says who is sending, the URL says which
event and to whom, and the address, the names and the link are all read on the
server. In the order the code runs them, it refuses with:

1. 404 — the event is missing or the caller may not see it (`getEventForViewer()`);
2. 403 — the caller may not manage it;
3. 409 — sharing is closed;
4. 404 — the recipient is not a person in the product;
5. 409 — the recipient is the caller, or cannot see the event;
6. 503 — no usable `EVENTS_APP_BASE_URL`;
7. 409 — the recipient's stored address is not plausible;
8. 500 — the email could not be rendered;
9. 503 — the mail service or sender is not configured;
10. 502 — the mail service timed out, was unreachable, or answered with an
    error.

Steps 7–10 happen inside `sendEventShareEmail()` and `sendMail()`, which return
a result the route maps to a status. Every refusal before step 10 is decided
without contacting the mail service. Each operational failure carries a short,
fixed message; the mail service's status and response stay in the server log.
The route's header comment lists the same statuses, but not in this order.

**Sending.** People are picked, counted and emailed inside one dialog, opened
from the Share menu. It sends **one request per recipient, in sequence**, best
effort: one failure does not stop the others, and one toast reports the batch
as sent, partly sent or failed — never calling a partial batch a success. The
dialog closes when every send went through, stays open with only the failed
people still ticked when any did not, and cannot be dismissed while a batch is
going out. Sent recipients leave the selection and failed ones stay selected
for the host to retry; nothing is retried automatically, because a send
that timed out may still have been delivered. A success changes nothing the page
shows, so it does not refresh. A 4xx means the page was stale, so it refreshes
then; a 5xx means the service behind the route failed, so it does not.

The email itself — its template, content, transport and sender — is "Email"
above. Why each of these was decided this way: [dec_log.md](dec_log.md).

Current position: [s_status.md](s_status.md).

## Seat-taking and concurrency

The capacity rule is a rule about seat-taking: **a seat-taking operation may add
a `going` registration only while the event's authoritative attendance is below
its capacity, or when capacity is unlimited.** Attendance is the event's unique
hosts — organizer and co-hosts — plus its `going` registrations
(`countAttendance()` in [lib/permissions.ts](../lib/permissions.ts), over
`getHostIds()` and the SQL `countGoing`); C6 added the hosts. It is not a
promise that attendance never exceeds capacity — see the last point below. The
rule spans rows and tables, so no database constraint can express it.
**Capacity is not enforced by the database.** It is held by an application
protocol, and the distinction is what a future change must not blur.

**What the database does guarantee**, by constraint: at most one registration
per person per event; valid enum values; a capacity that is unlimited or at
least one; an end after the start; and foreign keys that refuse to orphan a row
rather than cascading. The schema is [migrations/](../migrations/).

**What the application protocol guarantees.** At application runtime, the only
way to produce `going` is the seat protocol in
[lib/data/seats.ts](../lib/data/seats.ts), reached through
`db.registrations.claimSeat` (registering or requesting a place),
`db.registrations.approve` (a host's decision) and `db.registrations.restore`
(a host giving a removed attendee their place back). Lower-level `lib/data/`
helpers perform the physical write on its behalf. Each runs as one transaction
that:

1. locks the event row;
2. re-reads the authoritative state under that lock — the event with its
   co-hosts, the `going` count, the registration row — and works out
   attendance from them with `countAttendance()`, the same function the
   screens count with;
3. re-runs the same pure rule from [lib/permissions.ts](../lib/permissions.ts)
   the route already ran, so the business rule is never restated in T-SQL;
4. writes with the row's expected status as a predicate;
5. commits, atomically, which releases the lock.

The rest of the rules around it:

- **Writes that cannot raise the count** are compare-and-set transitions on
  the expected status, and none re-runs a rule under a lock. Publishing and
  cancelling write the event row alone. Withdrawing, rejecting and removing an
  attendee (`transitionRegistration` in
  [lib/data/registrations.ts](../lib/data/registrations.ts)) take the
  event-row lock — the same filtered `UPDLOCK` the seat claim takes — before
  writing their row, for one reason: to be ordered against a soft delete of the
  event (C5). A delete that committed first leaves no live row to lock, so the
  transition writes nothing and is `gone` (404); one that locked first makes
  the delete wait, so the transition is ordered before it. A row already moved
  is `stale` (409). The registration `UPDATE` also requires a live parent in
  the same statement, but only as a second line of defence: under
  `READ_COMMITTED_SNAPSHOT` with optimized locking (Azure SQL) that check is
  made before the statement waits on its row and is not repeated after the
  wait, which C5 reproduced as a write landing after a committed delete. Why
  the lock was chosen: [dec_log.md](dec_log.md).
- **Invitation writes take the lock without being seat claims.** Inviting and
  revoking write no registration and read no count, but they lock the event row
  before touching an invite row. Every seat claim reads the invite list while it
  holds that lock, so the list a claim decides visibility on cannot change
  before it commits. A new write to the invite rows must take the same lock.
- **Generic writes must not bypass the protocol.** The store offers no generic
  registration create, and `RegistrationUpdate` — the type
  `db.registrations.update` accepts — cannot express `going`, `eventId` or
  `userId`. That is a type-level restriction, not runtime validation: it keeps
  ordinary callers from being handed a seat-granting or re-parenting write. The
  wider internal update inside `lib/data/` exists for `seats.ts` and for
  `transitionRegistration`, which only ever receives the narrowed patch; a new
  runtime statement that sets `going` anywhere else breaks the invariant and
  nothing in the database will catch it. Add it to `seats.ts` instead.
- **Lock order starts from the event side**: deleting an event, inviting and
  revoking, and withdrawing, rejecting and removing each take its row before
  touching anything that references it, and no application transaction takes
  two event rows. Since C5 every runtime registration write takes its event's
  row first, so no transaction holds a registration row while it waits for
  that event's row, and the two cannot form a cycle.
- **The seed and reset tooling is out of band.** It writes the fixtures —
  including registrations already `going` — into an empty or just-cleared
  schema, under its own safety model ([u_environment.md](u_environment.md)).
  Its write transaction takes a lock on the whole events table before it
  mutates anything, and seed checks the tables are empty under that lock; the
  schema check, and reset's before-counts, are read beforehand outside it. It
  is bootstrap, not a runtime seat claim, so the seat-taking rule does not
  apply to it.
- **Capacity lowered by a host is not a seat claim.** M4 lets a host lower
  capacity below current attendance — even below the host count — and evicts
  nobody, so attendance above capacity stays a reachable state; what the
  protocol prevents is a seat-taking operation adding to it.
- **No host holds a registration on an event they host (C6).** Hosts are
  counted by role, so a host's own `going` row would count them twice. The
  invariant is held, not constrained: the seat claim refuses hosts under the
  lock; a new event has no rows; no product path changes an event's
  `organizerId` or co-hosts after creation (`POST /api/events` sets no
  co-hosts and `PATCH` cannot reach either); and the seed has none. If it is
  ever broken, attendance over-counts, which errs towards "full". A future
  feature that makes somebody a host — co-host management or transferring an
  event — must resolve that person's registration in the same transaction,
  under this event-row lock.

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
| Soft deletion, the `DeletedAt IS NULL` read filter and the event-row lock (`lockEvent`) | [lib/data/events.ts](../lib/data/events.ts) |
| Withdraw, reject and remove under the event-row lock (`transitionRegistration`) | [lib/data/registrations.ts](../lib/data/registrations.ts) |
| The seat-claim protocol — the only runtime path that may produce `going` | [lib/data/seats.ts](../lib/data/seats.ts) |
| Schema | [migrations/](../migrations/) |
| The SQL Server target, rejected constructs and shared-database rules | [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md) — **authoritative** |
| Visibility, manageability, creation rights, registration availability, request decisions, cancellation availability, attendee removal and restore availability, invitation and revocation availability, and sharing availability | [lib/permissions.ts](../lib/permissions.ts) — shared by pages and routes |
| Derived event context | [lib/events.ts](../lib/events.ts) — server only |
| Fixtures / personas | [lib/seed.ts](../lib/seed.ts) |
| API helpers | [lib/api.ts](../lib/api.ts) |
| API house style, worked example | [app/api/session/route.ts](../app/api/session/route.ts) |
| Registration writes, and the authorised-mutation example | [app/api/events/\[id\]/registrations/route.ts](../app/api/events/[id]/registrations/route.ts) |
| Approving and rejecting a request | [app/api/events/\[id\]/registrations/\[registrationId\]/approve/route.ts](../app/api/events/[id]/registrations/[registrationId]/approve/route.ts) · [.../reject/route.ts](../app/api/events/[id]/registrations/[registrationId]/reject/route.ts) |
| Removing and restoring an attendee | [app/api/events/\[id\]/registrations/\[registrationId\]/remove/route.ts](../app/api/events/[id]/registrations/[registrationId]/remove/route.ts) · [.../restore/route.ts](../app/api/events/[id]/registrations/[registrationId]/restore/route.ts) |
| Inviting a person and revoking an invitation | [app/api/events/\[id\]/invitations/\[userId\]/route.ts](../app/api/events/[id]/invitations/[userId]/route.ts) · writes in [lib/data/events.ts](../lib/data/events.ts) |
| An event's share link, and its origin | [lib/shareLinks.ts](../lib/shareLinks.ts) — server only |
| Emailing a person an event's link | [app/api/events/\[id\]/share-emails/\[userId\]/route.ts](../app/api/events/[id]/share-emails/[userId]/route.ts) |
| Email content, rendering and delivery | [lib/emails/](../lib/emails/) · [lib/services/](../lib/services/) — the latter server only |
| Email templates, their Outlook constraints and the email palette | [emails/](../emails/) — the headers of [BaseEmail.tsx](../emails/BaseEmail/BaseEmail.tsx) and [BaseEmailStyles.ts](../emails/BaseEmail/BaseEmailStyles.ts) |
| Event create / edit / publish / cancel / delete | [app/api/events/route.ts](../app/api/events/route.ts) · [app/api/events/\[id\]/route.ts](../app/api/events/[id]/route.ts) · [app/api/events/\[id\]/publish/route.ts](../app/api/events/[id]/publish/route.ts) · [app/api/events/\[id\]/cancel/route.ts](../app/api/events/[id]/cancel/route.ts) |
| What a host may set, and the rules it must satisfy | [lib/eventInput.ts](../lib/eventInput.ts) — shared by the form and the routes |
| The create / edit form | [components/events/EventForm.tsx](../components/events/EventForm.tsx) |
| Domain model | [lib/types.ts](../lib/types.ts) |
| User-facing copy | [lib/labels.ts](../lib/labels.ts) |
| Date formatting and grouping | [lib/date.ts](../lib/date.ts) |
| Design tokens | [app/styles/tokens.css](../app/styles/tokens.css) |
| Language, direction and fonts | [app/layout.tsx](../app/layout.tsx) — `lang`, `dir` and the font variables · font stack in [app/styles/tokens.css](../app/styles/tokens.css) |
| UI kit barrel | [components/ui/index.ts](../components/ui/index.ts) |
| A choice in a form — segments, chips, a labelled group | [components/ui/SegmentedControl.tsx](../components/ui/SegmentedControl.tsx) · [components/ui/Chip.tsx](../components/ui/Chip.tsx) · `Field` with `group` in [components/ui/Field.tsx](../components/ui/Field.tsx) |
| The viewer's own registration badge, and which statuses it leaves out | `ViewerRegistrationBadge` in [components/events/EventMeta.tsx](../components/events/EventMeta.tsx) |
| The approval queue, and its decision buttons | [components/events/ApprovalQueue.tsx](../components/events/ApprovalQueue.tsx) · [components/events/RequestDecisionActions.tsx](../components/events/RequestDecisionActions.tsx) |
| "Who is going", its host version, and the remove and restore buttons | [components/events/AttendeeList.tsx](../components/events/AttendeeList.tsx) · [components/events/AttendeeActions.tsx](../components/events/AttendeeActions.tsx) |
| The host's invitation list, its picker and revoke buttons | [components/events/InvitationList.tsx](../components/events/InvitationList.tsx) · [components/events/InvitationActions.tsx](../components/events/InvitationActions.tsx) |
| The Share menu, Copy Link and the share-email dialog | [components/events/ShareEventActions.tsx](../components/events/ShareEventActions.tsx) |
| Event components | [components/events/](../components/events/) |
| App frame | [components/layout/](../components/layout/) |
