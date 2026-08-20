# s_status — what is happening right now

> **Freshness:** verified against `master` at `f9bfc43` on 2026-08-20.
> Refresh cadence: every memory wrap PR. `./scripts/memory-bank.sh check`
> warns when master has moved more than three commits past this line.

**Volatile file.** Rewrite it from the actual post-merge state at wrap time —
do not edit it mid-branch and merge a stale claim. See
[`c_memory_protocol.md`](c_memory_protocol.md).

---

## In one line

The workshop skeleton is complete and the product is not started. **No milestone
has been begun.** `/events` and `/events/[id]` are deliberate stubs that render
an `EmptyState`.

## Shipping / merged

| What | State |
| --- | --- |
| Design tokens, UI kit, events components, app shell | done, on `master` |
| Async in-memory store, seed fixtures, persona switching | done, on `master` |
| API house style (`lib/api.ts` + `app/api/session/route.ts`) | done, on `master` |
| `/styleguide` — every component with real data | done, on `master` |
| The memory bank (this directory) + `scripts/memory-bank.sh` | **in flight**, this branch |

## Not started

M1 board · M2 detail screen · M3 register and respond · M4 create and edit in
place · M5 approval queue. All stretch goals. See [`s_backlog.md`](s_backlog.md).

## Known state of the two stubs

- `app/events/page.tsx` — lists nothing; renders an `EmptyState` that reports
  `db.events.list().length`. **No visibility filtering at all.**
- `app/events/[id]/page.tsx` — 404s only when the id does not exist. It will
  happily render an invite-only event to someone never invited. Its own comment
  says so: *"That is the first thing to fix."*

There is no `/api/events` route yet. M3 creates it.

## In flight

| Branch | What |
| --- | --- |
| `claude/memory-bank-architecture-e4f414` | this memory bank, the symlink tooling, the ignore fix |

Roughly a dozen teammate branches exist on `origin` (`*/events-board`,
`*/memory-bank`, and similar) from parallel workshop runs. They are **not**
merged into `master` and nothing here assumes their content. Check
`git branch -r` before assuming a milestone is unclaimed.

## Blocked

Nothing.

## Watch out for

- Fixtures live in memory and reset when the dev server restarts. Reset without
  restarting: `curl -X POST http://localhost:3000/api/dev/reset`.
- `pnpm-lock.yaml` is untracked in the main clone while `package-lock.json` is
  committed. Use **npm** — see [`u_eyal.md`](u_eyal.md).
