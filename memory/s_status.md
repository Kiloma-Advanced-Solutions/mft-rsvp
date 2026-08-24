# Current State

Where the project is right now. This file is **rewritten in place** as work
progresses — it is current state, not a changelog.

## Active milestone

**M1 — The Board** is complete. **M2 — The event detail screen** (`must`) is the
next milestone and has not started. Authoritative requirements and done-condition
for both: [TASKS.md](../TASKS.md) §5.

## Status

`/events` is implemented. It is a Server Component that resolves the viewer,
loads only the events that viewer may see, and then filters, sorts and groups
them; the category and access filters live in the URL.

The derived layer M1 needed now exists, and later milestones build on it rather
than rebuilding it:

- [lib/permissions.ts](../lib/permissions.ts) — the shared answer to "may this
  person see this event" and "may this person manage it".
- [lib/events.ts](../lib/events.ts) — builds `EventWithContext`, with visibility
  applied before any context is derived.

The shape and the boundaries between them are in [a_system.md](a_system.md).

`/events/[id]` is still the supplied stub, and it deliberately renders any event
it finds with **no visibility check** — that is M2's first job, not a bug to
report.

## What is actually implemented

Everything that is not the product was supplied. Do not rebuild it — see
[TASKS.md](../TASKS.md) §3 for the full inventory.

- Design tokens (light and dark) and the `components/ui/` kit.
- `components/events/` — cards, badges, date blocks, capacity meter.
- `components/layout/` — app shell, nav, persona switcher.
- The in-memory store, seeded with 12 events and 5 people covering every state.
- `/api/session` (the API house-style example) and `/api/dev/reset`.
- `/styleguide` and the start page at `/`.

M1 replaced the `/events` stub and added `lib/permissions.ts`, `lib/events.ts`
and `components/events/BoardFilters.tsx`.

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

Last updated: 2026-08-24 — M1 complete and merged; M2 not started.
