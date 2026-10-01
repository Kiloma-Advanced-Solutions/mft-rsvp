# Current State

Where the project is right now. This file is **rewritten in place** as work
progresses — it is current state, not a changelog.

## Active milestone

**None in progress.** M1–M8 are complete and merged into
`yardenah/events-board`: the original assignment's three `must` and two
`should` milestones; M6, the first post-assignment milestone, which moved
persistence to SQL Server (PR #24); M7, event cancellation (PR #28); and M8,
removing and restoring attendees (PR #30). The UI is also localized to Hebrew
and RTL (PR #25), which changed presentation only; what it fixed in place is in
[a_system.md](a_system.md).

**Next is M9 — invitation management — and it has not started.** It was the
third item on the original stretch list, promoted ahead of the remaining
extensions; its product decisions are still open and are listed in
[TASKS.md](../TASKS.md) §5. M10 and M11 (shareable links, application logging)
follow it and are future work. The rest of the original stretch list — the
calendar view first, then the waitlist, search, "my events", optimistic UI and
a theme toggle — is also unstarted. Authoritative requirements for every
milestone, extension and stretch goal: [TASKS.md](../TASKS.md) §5.

## Status

Both screens are server-rendered end to end, and the controls on them act — for
attendees since M3, and for hosts since M4, M5, M7 and M8.

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
**cancel** a published event that has not started yet (M7), and **remove** a
confirmed attendee or **restore** a removed one on an `approval` or `invite`
event (M8).

A cancelled event stays on the board, in a section of its own, and its detail
page stays readable to whoever could see it before; registering, withdrawing
and deciding requests are closed on it, and its registrations are kept as they
were.

The approval queue is a host-only section of `/events/[id]` listing the requests
still waiting and the ones already turned down, with whatever message the
requester sent. A host approves or rejects each one, and the counts, the
capacity meter and "Who is going" re-derive on the spot. How it fits together is
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
- `components/layout/` — app shell, nav, persona switcher.
- The fixtures — 12 events and 5 people covering every state.
- `/api/session` (the API house-style example).
- `/styleguide` and the start page at `/`.

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
The shape of all of it is in [a_system.md](a_system.md).

## Deliberately absent

Not missing — decided against, for this milestone or for the exercise. A later
session should not treat any of these as an oversight to fix.

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
auto-promotion. **Managing invitations** is no longer a stretch goal: it is M9,
and until it lands nothing in the product writes an invite list — only the
fixtures do. Note that approving somebody who can no longer see an invite-only
event does *not* add them to its invite list, and neither removing nor
restoring an attendee changes it; that is invitation management, and nothing
does it on anyone's behalf.

## Known limitations

The capacity invariant is held by an application protocol, not a database
constraint, and a host may still lower capacity below current attendance —
M4's rule, kept deliberately — so `goingCount > capacity` remains a reachable
state. What cannot happen is a seat-taking operation adding to it. Seat claims
for one event serialize on its row. See [a_system.md](a_system.md)
"Seat-taking and concurrency".

An event read is stitched from several reads of committed data, not one
snapshot; accepted for rendering. Only capacity-sensitive writes re-decide under
a lock — see [a_system.md](a_system.md) "Data layer".

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

A request left pending on an event that has been cancelled or has already
started can no longer be decided by anyone, which is the accepted cost of
closing decisions the same way registration closes. Likewise, a `going`
registration on such an event cannot be withdrawn by its owner. Since M7 a host
can cancel an event in the product, so the cancelled case is reached through
ordinary use, not only through the fixtures. No cleanup behaviour exists. The
same holds for a `removed` row on such an event: removing and restoring close
with registration, so it stays removed.

Restoring gives a removed attendee their place back, not their access. If an
access change has since hidden the event from them, the host's list warns about
it on their `removed` row; once restored, they are `going` to an event they
cannot see, and their `going` row carries no such warning. The fix is an
invitation, which M9 has yet to provide.

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

Last updated: 2026-10-01 — M8 (removing and restoring attendees) merged into
`yardenah/events-board`; no milestone in progress, M9 (invitation management)
next.
