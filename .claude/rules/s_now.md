---
description: What is in flight right now. Volatile — refresh every PR.
---

# State — updated 2026-08-20

Everything below goes stale fast. If the date above is old, verify before
trusting it.

## Built

- 2026-08-20 — Skeleton complete and on `master`: design tokens, UI kit,
  `components/events/`, layout, `lib/` (db, seed, session, api, labels, date,
  types, cx), `/api/session`, `/api/dev/reset`, `/styleguide`, start page.

## Not built

- 2026-08-20 — `/events` and `/events/[id]` are still stubs. Nothing under
  `/api/events` exists. There is no shared module answering "can this person see
  this event" yet.

## In flight

- 2026-08-20 — Branch `claude/project-memory-setup-75a477` (worktree): this
  memory setup (committed).
- 2026-08-20 — `docs/BRIEF-M1-board.md` is the agreed brief for the next
  milestone (the `/events` board) with three settled decisions: filter state in
  URL search params; access-mode filter offers only modes the viewer can see;
  hosts' drafts in their own section. **No code written against it yet** — and
  whether it is the immediate next task is unconfirmed.

## Elsewhere

- 2026-08-20 — Teammates have M1 implementations in open PRs (#2, #3, #4); see
  `r_links.md`. None merged. `master` is unchanged by them.
