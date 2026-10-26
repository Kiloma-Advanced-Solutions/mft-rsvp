# Current State

Where the project is right now. This file is **rewritten in place** as work
progresses — it is current state, not a changelog.

## Active milestone

**Pre-M11 stabilization — in progress.** Eleven fixes and
behaviour changes requested after M10 are being delivered before M11 in six
branches, C1–C6, in a fixed order; two of them (category colours and the
explanatory-note review) are deferred into M11. The approved requirements,
branch boundaries, order and decisions H1–H3 are in
[docs/pre-m11-stabilization-plan.md](../docs/pre-m11-stabilization-plan.md),
a temporary plan that the last of the six branches retires. Nothing it
describes as new behaviour is built until its branch is merged. Branches
merged so far: C1 (removing the workshop pages, PR #41), C2 (UI text
fixes, PR #42) and C3 (rejected users on open events, PR #43). C4 (event
date rules) is implemented and verified on its branch,
`yardenah/event-date-rules`, but not yet committed, reviewed or merged;
C5 and C6 have not started.

M1–M10 are complete and merged into
`yardenah/events-board`: the original assignment's three `must` and two
`should` milestones; M6, the first post-assignment milestone, which moved
persistence to SQL Server (PR #24); M7, event cancellation (PR #28); M8,
removing and restoring attendees (PR #30); M9, invitation management
(PR #32), the third item on the original stretch list, promoted; and M10,
shareable event links and email sharing (PR #38). The UI is also
localized to Hebrew and RTL (PR #25), which changed presentation only; what it
fixed in place is in [a_system.md](a_system.md).

**After the stabilization, M11 and M12, both future work.** M11 (system
redesign, against an external Style Guide that has not been supplied yet) and
M12 (application logging) are specified in [TASKS.md](../TASKS.md) §5. The
rest of the original stretch list — the calendar view first, then the waitlist,
search, "my events", optimistic UI and a theme toggle — is also unstarted.
Authoritative requirements for every milestone, extension and stretch goal:
[TASKS.md](../TASKS.md) §5.

## Status

Both screens are server-rendered end to end, and the controls on them act — for
attendees since M3, and for hosts since M4, M5, M7, M8, M9 and M10.

`/events` resolves the viewer, loads only the events that viewer may see, and
then filters, sorts and groups them; the category and access filters live in the
URL. Whoever may create an event gets a **New event** action here.

`/events/[id]` shows one event to whoever may see it. An event that does not
exist and an event the viewer may not see produce the same 404, so the page
cannot confirm that a hidden event exists.

Attendees act: registering, requesting a place and withdrawing all go through
the registrations route, which enforces the [TASKS.md](../TASKS.md) §4 rules on
the server.

Hosts act too. A host can **create** an event, **edit** it in place, **publish**
a draft and **delete** it (M4), **decide the requests on it** (M5),
**cancel** a published event that has not started yet (M7), **remove** a
confirmed attendee or **restore** a removed one on an `approval` or `invite`
event (M8), **invite** existing people to an invite-only event or
**revoke** their invitations (M9), and **share** a published event that has
not started (M10).

On the C4 branch, not yet merged: a new or moved start must be in the future,
a draft whose start has passed cannot be published until it is moved, and a
published event that has started or a cancelled one keeps its dates — the form
shows them disabled and says why. The rules are in [TASKS.md](../TASKS.md) §4
"Scheduling".

A cancelled event stays on the board, in a section of its own, and its detail
page stays readable to whoever could see it before; registering, withdrawing
and deciding requests are closed on it, and its registrations are kept as they
were.

The approval queue is a host-only section of `/events/[id]` listing the requests
still waiting and the ones already turned down, with whatever message the
requester sent. A host approves or rejects each one, and the counts, the
capacity meter and "Who is going" re-derive on the spot. A person who was turned
down cannot ask again while the event is `approval` or `invite`, but if it is
switched to `open` they may register on their own, and their panel says why the
register button is there. How it fits together is
in [a_system.md](a_system.md); why it behaves as it does is in
[dec_log.md](dec_log.md).

A host's "Who is going" carries a remove action beside each confirmed attendee
the host may currently remove, and a separate group of the people who were
removed, each with a restore action. A removed person cannot register again on
their own while the event is `approval` or `invite` — only a host can restore
them, and only while the event is published, has not started and has room —
but if the event is switched to `open`, ordinary registration is their way
back. Like the queue,
that host view is built only for people who may manage the event; everyone
else gets the plain attendee list.

Below "Who is going", a host of an invite-only event sees its **invitation
list**: who is invited and where each of them stands, a revoke action beside
each, and — while inviting is open — a picker for inviting one or several
people at once. Inviting does not register anybody — an invitee sees the event
and registers through the ordinary flow — and revoking leaves the person's
registration as it is. On an event that is no longer invite-only, a list left
over from when it was is shown read-only, and counts again if the event goes
back to `invite`. Like the queue, the list is built only for people who may
manage the event; an invitee sees nothing of it.

In the host tools, a host can **copy the event's link** — with the URL shown in
a read-only field if the clipboard is refused — and **email it** to people
picked from everyone who can already see the event. The link is the event's
own page and grants nothing: an invite-only event stays a 404 for anyone not on
its list, and nothing is invited, registered or written. On a draft, a
cancelled event or one that has started, the host tools say why sharing is
closed instead. How it fits together is in [a_system.md](a_system.md) "Sharing
events".

**Everything is persistent (M6).** Users, events and registrations live in SQL
Server behind the `lib/db.ts` contract the product was built on — kept, except
that registration writes were deliberately narrowed: there is no public
`registrations.create`, and generic updates take the restricted
`RegistrationUpdate`. Identifiers are UUIDs, and data survives a dev-server
restart. The product behaviour of
M1–M5 did not change. Taking a place and approving one are now safe under
concurrency, which closed the final-seat race earlier milestones had accepted.
The shape is in [a_system.md](a_system.md); running it is in
[u_environment.md](u_environment.md).

Nothing is inert: every control the product renders acts.

## What is actually implemented

Everything that is not the product was supplied. Do not rebuild it — see
[TASKS.md](../TASKS.md) §3 for the full inventory.

- Design tokens (light and dark) and the `components/ui/` kit.
- `components/events/` — cards, badges, date blocks, capacity meter.
- `components/layout/` — app shell, brand link, persona switcher.
- The fixtures — 12 events and 5 people covering every state.
- `/api/session` (the API house-style example).

The supplied start page at `/` and the `/styleguide` page were retired by C1:
`/` redirects to the board at `/events`, and the components the style guide
showed are kept in `components/`.

The product built on top of that: the board and the detail screen, the shared
permission and event-context layers beneath them, the registration write path,
the four host write paths added by M4, and the two request-decision routes added
by M5. M6 replaced the supplied in-memory store with the SQL Server persistence
layer, its schema and migration runner, the seed and reset tooling, and the
static SQL compatibility guard; the supplied HTTP reset endpoint was removed.
M7 added the cancel route, its shared rule, and the cancelled presentation on
the board and the detail screen, with no schema change.
M8 added the remove and restore routes, their two shared rules, and the host's
attendee list with its one client leaf, plus migration `0002` — the first schema
change since M6 — which admits the `removed` registration status.
M9 added the invitation route, its three shared rules, the host's invitation
list with its one client leaf, and a warning on a confirmed attendee who can no
longer see the event, with no schema change.
M10 added the sharing rule, the share-link builder, Copy Link and the
share-email picker in the host tools, the share-email route, the email layer —
the organizational transport, the React Email shell and template, the HTML and
plain-text content, and Jerusalem-time email dates — plus the email preview
script and the image conversion script, with no schema change.
The shape of all of it is in [a_system.md](a_system.md).

## Deliberately absent

Not missing — decided against, for this milestone or for the exercise. A later
session should not treat any of these as an oversight to fix.

From M10's scope — why the sharing and email items were decided is in
[dec_log.md](dec_log.md). Send history was outside M10's scope rather than a
recorded decision, and extended `MAIL_SERVICE_URL` validation was deliberately
not implemented in this milestone:

- **No share token, slug or record.** The link is the event's own URL, so
  there is nothing to revoke or regenerate.
- **No access through sharing.** Copying or emailing a link invites nobody,
  registers nobody and takes no seat.
- **No sharing a draft, a cancelled event or one that has started.**
- **No emailing someone who cannot see the event**, and no emailing oneself.
- **No send history and no notification record.** Nothing records who shared
  what with whom, or when.
- **No automatic retry and no bulk endpoint.** Emailing several people is one
  request per person, in sequence, best effort; a failed one stays selected for
  the host to send again by hand.
- **No `MAIL_SERVICE_URL` validation beyond a non-empty value.** The value is
  trimmed and trailing slashes are removed before `/sendMail` is appended, and
  nothing more is checked — unlike `EVENTS_APP_BASE_URL`, which must be a bare
  `http`/`https` origin. A malformed value is not rejected at startup or when
  read: it is found only when a send is attempted, and the send fails — the
  route reports it as a delivery failure (502). A well-formed but wrong URL is
  not detected either; the request goes wherever it points.

From M9's scope — why each was decided is in [dec_log.md](dec_log.md):

- **No registration changes.** Inviting registers nobody, and revoking never
  cancels or removes a registration, a `going` place included.
- **No inviting someone who may manage the event**, and nobody who is not
  already a user — the product has no way to create one.
- **No changing a dormant list.** While the event is not invite-only, its list
  is read-only: nothing can be added or revoked until access is `invite` again.
- **No inviting to a cancelled event or one that has started.** Revoking stays
  open there, so an invitation revoked then cannot be given back.
- **No inviting during event creation.** The list is managed on the detail page
  only.
- **No atomic bulk invite.** Inviting several people is one request per person,
  best effort; some may succeed while others are refused.
- **No invitation metadata and no notifications.** Nothing records who invited
  whom or when, and nobody is told they were invited.
- **No visibility of the list for invitees.** They cannot see who else is
  invited.

From M8's scope — why each was decided is in [dec_log.md](dec_log.md):

- **No removing or restoring on an `open` event.** An open event admits
  anyone, so a host has no say over who attends it; a removed person there
  registers again on their own.
- **No removing someone who may manage the event** — a host, a co-host or an
  admin. They step back out by withdrawing, like anyone else.
- **No invitation changes.** Removing and restoring write the registration row
  alone; neither revokes nor grants an invitation.
- **No removal metadata.** Nothing records who removed someone, when or why,
  beyond the row's `updatedAt`.
- **No confirmation on restore.** Removing asks first; restoring does not.

From M7's scope — why each was decided is in [dec_log.md](dec_log.md):

- **No restore.** Cancelling is terminal; nothing un-cancels an event, and
  editing a cancelled one leaves it cancelled.
- **No cancelling a draft or an event that has already started.** Only a
  published event that has not started may be cancelled.
- **No registration rewrite.** Cancelling changes no registration row.
- **No cancellation metadata.** Nothing records who cancelled, when, or why.

From M6's scope:

- **No ORM.** The data layer is hand-written statements through the driver —
  see [dec_log.md](dec_log.md).
- **No event versioning or ETags**, so content edits stay last-write-wins.
- **No retry framework and no lock timeout.** With event-first lock ordering no
  known deadlock cycle currently requires one.
- **No schema beyond today's domain model** — no share-token, logging or
  waitlist columns. Those belong to the milestones that decide them.
- **No database-level changes and no non-table objects.** The compatibility
  contract forbids `ALTER DATABASE` on the shared database and any view,
  procedure, function or trigger — see
  [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md).

From M5's scope:

- **No request-message input.** The queue *displays* a message when a
  registration carries one, but nothing in the product writes one — only the
  fixtures do. Collecting them means reopening the registration write path.
- **No bulk approve or reject.** [TASKS.md](../TASKS.md) §5 asks for a decision
  on each request.
- **No optimistic UI** on any control, in M5 or anywhere else.

From earlier milestones, and still true: co-host management, and transferring
an event to another organizer.

Every remaining stretch goal is unstarted, including the **waitlist** with its
auto-promotion. **Managing invitations** was promoted to M9 and is delivered.
Note that approving somebody who can no longer see an invite-only event does
*not* add them to its invite list, and neither removing nor restoring an
attendee changes it; only a host's invitation does, and nothing invites anyone
on their behalf.

## Known limitations

The capacity invariant is held by an application protocol, not a database
constraint, and a host may still lower capacity below current attendance —
M4's rule, kept deliberately — so `goingCount > capacity` remains a reachable
state. What cannot happen is a seat-taking operation adding to it. Seat claims
for one event serialize on its row. See [a_system.md](a_system.md)
"Seat-taking and concurrency".

An event read is stitched from several reads of committed data, not one
snapshot; accepted for rendering. Only capacity-sensitive writes and invitation
writes re-decide under the event-row lock — see [a_system.md](a_system.md)
"Data layer".

Migrations are single-operator, and applied migrations are immutable by
convention only — see [u_environment.md](u_environment.md) "Migration operating
contract".

The SQL is written to the SQL Server 2008 R2 feature floor and statically
enforced; runtime verification has only been performed against Azure SQL DEV,
not a real 2008 R2 server. What remains unverified is listed in
[docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md)
"Deployment preflight".

Concurrent edits to the same event are last-write-wins: `EventRecord` carries no
version, so M4 did not attempt optimistic concurrency, and M6 kept that. Named,
not solved.

The edit form's dates are produced in the server's time zone and read back in
the browser's. When the two differ, an untouched date on an event whose dates
may still change is re-sent shifted. C4 keeps it from blocking edits of a
started or cancelled event — those dates are not sent — but does not fix it.

A request left pending on an event that has been cancelled or has already
started can no longer be decided by anyone, which is the accepted cost of
closing decisions the same way registration closes. Likewise, a `going`
registration on such an event cannot be withdrawn by its owner. Since M7 a host
can cancel an event in the product, so the cancelled case is reached through
ordinary use, not only through the fixtures. No cleanup behaviour exists. The
same holds for a `removed` row on such an event: removing and restoring close
with registration, so it stays removed.

Restoring gives a removed attendee their place back, not their access. If an
access change or a revoked invitation has since hidden the event from them, the
host's list warns about it on their row, `removed` or, once restored, `going`.
The fix is to invite them — possible only while inviting is open, so not once
the event has started or been cancelled.

Revoking an invitation leaves a `going` registration standing. The person keeps
their seat and it counts against capacity, but they can no longer see the
event, so they cannot withdraw on their own — the registrations route answers
with a 404. While the event has neither started nor been cancelled, a host can
still free the seat: by removing them, or by giving their sight of the event
back — re-inviting them, or moving the event off `invite` — after which they
can withdraw. Once the event has
started or been cancelled, withdrawing, removing and inviting are all closed
while revoking stays open, so nothing short of deleting the event frees that
seat. The host's list flags the row; nothing resolves it. This is the accepted
cost of keeping invitation and registration independent — see
[dec_log.md](dec_log.md).

**Email delivery is implemented but not verified against the organization.**
What M10 verified, per PR #38: typecheck, lint, build and `check:tsql`; the
exact request shape, the error paths and Jerusalem-time dates against a
temporary local stand-in for the mail service; every refusal of the route
through a temporary route-level harness; and the UI as five personas against
that stand-in. None of it was kept as an automated test — the repository has no
test suite. **Not verified:** the real mail service, the real
`MAIL_SERVICE_URL` and sender values, actual delivery, and rendering in
Outlook 2016 — including the `data:` URI logo — none of which was available.

Sharing needs configuration in every deployment: `EVENTS_APP_BASE_URL` for the
link at all, and `MAIL_SERVICE_URL`, `EVENTS_MAIL_SENDER_NAME`,
`EVENTS_MAIL_SENDER_EMAIL` and `EVENTS_MAIL_SYSTEM_ID` for email. Without the
first, the host tools say sharing is unavailable; without the others, every send
is refused as "not configured". [.env.example](../.env.example) is
authoritative. Copying to the clipboard also needs the page to be in a secure
context, which the browser decides — plain `http` on a non-local host, for
example, is not one. Where the clipboard is unavailable or refused, the copy
fails and the URL is shown in a read-only field for copying by hand.

A recipient who opens a shared link is not "signed in": the product has no
authentication. They see the event as whichever persona their browser's cookie
names, or as the default persona if it names none — see
[u_environment.md](u_environment.md) "Persona-based development".

## Blockers

None.

## Branches and worktrees

- Integration branch: **`yardenah/events-board`**. Milestone branches are created
  from it, and merged back through their own PR.
- The workflow and its conventions are in [u_environment.md](u_environment.md).

## Before saying you are done

Verification requirements and their sources are in
[c_conventions.md](c_conventions.md); the definition of done is
[TASKS.md](../TASKS.md) §7.

---

Last updated: 2026-10-25 — pre-M11 stabilization in progress: C1 (PR #41),
C2 (PR #42) and C3 (PR #43) merged, C4 implemented on its branch and not yet
merged; M11 (system redesign) and M12 (application logging) follow it.
