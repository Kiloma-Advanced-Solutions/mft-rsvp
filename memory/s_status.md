# Current State

Where the project is right now. This file is **rewritten in place** as work
progresses — it is current state, not a changelog.

## Active milestone

**M1 — The board**, **M2 — The event detail screen**, **M3 — Register and
respond** and **M4 — Create and edit in place** are complete and merged. All
three `must` milestones and the first `should` are done.

**M5 — The approval queue** (`should`) is next and has **not started**.
Authoritative requirements and done-conditions for every milestone:
[TASKS.md](../TASKS.md) §5.

## Status

Both screens are server-rendered end to end, and the controls on them now act —
for attendees since M3, and for hosts since M4.

`/events` resolves the viewer, loads only the events that viewer may see, and
then filters, sorts and groups them; the category and access filters live in the
URL. Whoever may create an event gets a **New event** action here.

`/events/[id]` shows one event to whoever may see it. An event that does not
exist and an event the viewer may not see produce the same 404, so the page
cannot confirm that a hidden event exists.

Attendees act: registering, requesting a place and withdrawing all go through
the registrations route, which enforces the [TASKS.md](../TASKS.md) §4 rules on
the server.

Hosts now act too. M4 made the host tools real, so a host can:

- **create** an event from `/events/new`, which produces a **draft**;
- **edit** it in place on `/events/[id]`, with no separate edit screen;
- **publish** a draft;
- **delete** it, behind a confirmation that names what is lost.

Every one of those is authorised on the server, not by the presence of a
button. How the pieces fit together is in [a_system.md](a_system.md); why they
were built this way is in [dec_log.md](dec_log.md).

Still inert: nothing decides a pending request. The approval queue is M5.

## What is actually implemented

Everything that is not the product was supplied. Do not rebuild it — see
[TASKS.md](../TASKS.md) §3 for the full inventory.

- Design tokens (light and dark) and the `components/ui/` kit.
- `components/events/` — cards, badges, date blocks, capacity meter.
- `components/layout/` — app shell, nav, persona switcher.
- The in-memory store, seeded with 12 events and 5 people covering every state.
- `/api/session` (the API house-style example) and `/api/dev/reset`.
- `/styleguide` and the start page at `/`.

The product built on top of that: the board and the detail screen, the shared
permission and event-context layers beneath them, the registration write path,
and the four host write paths added by M4. The shape of all of it is in
[a_system.md](a_system.md).

Not implemented: the approval queue (M5), and every stretch goal — the calendar
view, the waitlist, managing invitations, search, "my events", optimistic UI and
the theme toggle. Also deliberately absent, as out of M4's scope: cancelling an
event, co-host management and transferring an event to another organizer.

## Known limitations

Two simultaneous registrations for the final seat can race, because the supplied
in-memory store offers no atomic capacity reservation. M3 accepted this rather
than redesigning the data layer, and M4 did not change it; it is **not** solved.
The reasoning and what it means for M5's approval path are in
[dec_log.md](dec_log.md).

Concurrent edits to the same event are last-write-wins: `EventRecord` carries no
version, so M4 did not attempt optimistic concurrency. Named, not solved.

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

Last updated: 2026-09-01 — M4 complete and merged; M5 not started.
