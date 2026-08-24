# Current State

Where the project is right now. This file is **rewritten in place** as work
progresses — it is current state, not a changelog.

## Active milestone

**M1 — The Board** (`must`) — the events list at `/events`.
Authoritative requirements and done-condition: [TASKS.md](../TASKS.md) §5.

## Status

M1 has not started; `app/events/page.tsx` is still the supplied board stub, and no
M1 implementation has been merged into `yarden/events-board`. The detail-page
implementation belongs to a later milestone.

## What is actually implemented

Everything that is not the product was supplied. Do not rebuild it — see
[TASKS.md](../TASKS.md) §3 for the full inventory.

- Design tokens (light and dark) and the `components/ui/` kit.
- `components/events/` — cards, badges, date blocks, capacity meter.
- `components/layout/` — app shell, nav, persona switcher.
- The in-memory store, seeded with 12 events and 5 people covering every state.
- `/api/session` (the API house-style example) and `/api/dev/reset`.
- `/styleguide` and the start page at `/`.

## Immediate next step

Implement M1 at `/events`: show the events the viewer is allowed to see, using
`EventCard` inside `EventGrid`. See [TASKS.md](../TASKS.md) §5 for the criteria.

## Blockers

None.

Two open seams that milestone work will need to fill, described in
[a_system.md](a_system.md):

- no shared visibility/manageability helper exists yet;
- nothing constructs an `EventWithContext`.

## Branches and worktrees

- Development branch: **`yarden/events-board`**.
- Claude Code sessions may work in isolated `claude/*` worktree branches based on
  it. The workflow and its conventions are in [u_environment.md](u_environment.md).

## Before saying you are done

Verification requirements and their sources are in
[c_conventions.md](c_conventions.md); the definition of done is
[TASKS.md](../TASKS.md) §7.

---

Last updated: 2026-08-20 — Memory Bank initialised; M1 not started.
