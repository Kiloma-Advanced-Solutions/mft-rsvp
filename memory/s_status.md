# Current State

Where the project is right now. This file is **rewritten in place** as work
progresses — it is current state, not a changelog.

## Active milestone

**M2 — The event detail screen** is complete and merged. **M3 — Register and
respond** (`must`) is next and has not started. Authoritative requirements and
done-conditions for every milestone: [TASKS.md](../TASKS.md) §5.

## Status

Both screens exist and are server-rendered end to end.

`/events` resolves the viewer, loads only the events that viewer may see, and
then filters, sorts and groups them; the category and access filters live in the
URL.

`/events/[id]` shows one event to whoever may see it. An event that does not
exist and an event the viewer may not see produce the same 404, so the page
cannot confirm that a hidden event exists. The viewer's call to action and the
host-only tools each show the correct state for that viewer, but neither acts
yet: the mutations behind them belong to M3 and M4.

The derived layer both screens share:

- [lib/permissions.ts](../lib/permissions.ts) — the shared answer to "may this
  person see this event", "may this person manage it", and "may this person take
  a place at it".
- [lib/events.ts](../lib/events.ts) — builds the context for a board of events
  and for a single one, with visibility applied before any context is derived.

The shape and the boundaries between them are in [a_system.md](a_system.md).

**There is no registration API yet.** `app/api/` holds `/api/session` and
`/api/dev/reset` and nothing else; nothing in the app writes a registration.
That is where M3 begins.

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
`components/events/RegistrationPanel.tsx`.

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

Last updated: 2026-08-26 — M2 complete and merged; M3 not started.
