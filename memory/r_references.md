# r_references — pointers to external truth

Links out. Nothing here is a source of truth itself; it says **where** the truth
is, and what it is authoritative for.

## In this repo

| Where | Authoritative for |
| --- | --- |
| [`TASKS.md`](../TASKS.md) | **The specification.** Roles, visibility, registration rules, milestones, definition of done. Wins over anything remembered in this bank. |
| [`CLAUDE.md`](../CLAUDE.md) | Session bootstrap — the reading order and the rules that must be in context before any file is read. |
| [`AGENTS.md`](../AGENTS.md) | The warning that this Next.js differs from training data. Written by `next dev`; commit it with your work. |
| [`README.md`](../README.md) | Getting started, scripts, the layout tour. |
| `lib/types.ts` | The domain model. Where the glossary and the code disagree, this wins. |
| `app/api/session/route.ts` | The worked example of the API house style. |
| `/styleguide` (running app) | Every component with real data. Read before writing CSS. |
| `node_modules/next/dist/docs/` | Next.js 16.3.1 behaviour. Read it; do not write the framework from memory. |

## Outside

| What | Where |
| --- | --- |
| Repository | `https://github.com/Kiloma-Advanced-Solutions/mft-rsvp` (`origin`, default branch `master`) |
| Workshop brief, as distributed | `docs/KAS-WS-0014-01-Events-Board-Workshop-Brief.pdf` |
| Training deck this bank implements | *Kiloma — AI-Native Development, Part 2 of 6: Memory Bank & Worktree Architecture.* Held locally by the operator; not in the repo. |
| Issue tracker | Linear, issue keys `KIL-NNN`. **Its GitHub automation auto-completes an issue whose key appears in a merged PR's title, branch or commits** — see `L-20260820-01`. |

## The training series

Six parts. This bank implements Part 2.

| Part | Topic |
| --- | --- |
| 1 | Foundations & the brief |
| **2** | **Memory bank & worktree architecture** ← this bank |
| 3a | TDD, drift & drift-guards |
| 3b | Bots, green-light & monitoring |
| 4 | Operating as a lead: cost & coaching |
| 5 | The canonical-fixture bug-hunt |

Part 3a introduces `c_bugbot_workflow.md` (TDD-per-finding, pre-push
self-audit). It does not exist yet — do not link to it until it does.

## Local commands worth remembering

```bash
npm run dev                                   # dev server on :3000
npm run typecheck && npm run lint && npm run build
curl -X POST http://localhost:3000/api/dev/reset   # reload fixtures
./scripts/memory-bank.sh check                # prove the memory symlink
```
