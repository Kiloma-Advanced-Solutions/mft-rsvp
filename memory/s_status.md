# Current State

Where the project is right now. This file is **rewritten in place** as work
progresses — it is current state, not a changelog.

## Active milestone

**M1 — The board**, **M2 — The event detail screen** and **M3 — Register and
respond** are complete and merged. All three `must` milestones are done.
**M4 — Create and edit in place** (`should`) is next and has not started.
Authoritative requirements and done-conditions for every milestone:
[TASKS.md](../TASKS.md) §5.

## Status

Both screens exist and are server-rendered end to end, and the first write path
is in place behind them.

`/events` resolves the viewer, loads only the events that viewer may see, and
then filters, sorts and groups them; the category and access filters live in the
URL.

`/events/[id]` shows one event to whoever may see it. An event that does not
exist and an event the viewer may not see produce the same 404, so the page
cannot confirm that a hidden event exists.

The viewer's call to action now **acts**: registering, requesting a place and
withdrawing all go through
[app/api/events/\[id\]/registrations/route.ts](../app/api/events/[id]/registrations/route.ts),
which enforces the [TASKS.md](../TASKS.md) §4 rules on the server and refuses a
hidden event exactly as it refuses a missing one. How that path is assembled is
in [a_system.md](a_system.md). The host-only tools still do not act — editing
and publishing are M4, and the approval queue is M5.

The derived layer all three share:

- [lib/permissions.ts](../lib/permissions.ts) — the shared answer to "may this
  person see this event", "may this person manage it", and "may this person take
  a place at it". M3 reused all three unchanged.
- [lib/events.ts](../lib/events.ts) — builds the context for a board of events
  and for a single one, with visibility applied before any context is derived.

The shape and the boundaries between them, including the registration write
path, are in [a_system.md](a_system.md).

## What is actually implemented

Everything that is not the product was supplied. Do not rebuild it — see
[TASKS.md](../TASKS.md) §3 for the full inventory.

- Design tokens (light and dark) and the `components/ui/` kit.
- `components/events/` — cards, badges, date blocks, capacity meter.
- `components/layout/` — app shell, nav, persona switcher.
- The in-memory store, seeded with 12 events and 5 people covering every state.
- `/api/session` (the API house-style example) and `/api/dev/reset`.
- `/styleguide` and the start page at `/`.

The product built on top of that: M1 replaced the `/events` stub and added
`lib/permissions.ts`, `lib/events.ts` and `components/events/BoardFilters.tsx`;
M2 replaced the `/events/[id]` stub and added
`components/events/RegistrationPanel.tsx`; M3 added
`app/api/events/[id]/registrations/route.ts` and
`components/events/RegistrationActions.tsx`, the detail screen's only client
leaf.

Not implemented: creating, editing, publishing and deleting events (M4), the
approval queue (M5), and every stretch goal, including the waitlist.

## Known limitations

Two simultaneous registrations for the final seat can race, because the supplied
in-memory store offers no atomic capacity reservation. M3 accepted this rather
than redesigning the data layer; it is **not** solved. The reasoning and what it
means for M5's approval path are in [dec_log.md](dec_log.md).

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

Last updated: 2026-08-30 — M3 complete; M4 not started.
