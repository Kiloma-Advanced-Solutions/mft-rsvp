@AGENTS.md

# Events Board

An internal events board: organizers publish events, everyone else finds them and
registers. Every event opens up in one of three ways — freely, behind an approval
step, or by invitation only. This repo is a Claude Code workshop starting point:
the design system, UI kit, data layer, session and API conventions are built; the
product is not. The specification is [`TASKS.md`](TASKS.md).

## Stack

Next.js 16 App Router · React 19 · TypeScript (strict) · CSS Modules.
No other runtime dependencies, no test runner, no CI.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `curl -X POST http://localhost:3000/api/dev/reset` | Reload fixtures without restarting |

All three of typecheck, lint and build must be clean before anything is called
done — then click through as at least one organizer and one member.

## Where things are written down

Detail lives in `.claude/rules/`, one file per topic. The prefix says what kind
of thing it is and how much to trust it:

| Prefix | Kind | Read it when |
| --- | --- | --- |
| `a_*` | **Architecture** — how the system is built. Stable. | Touching the area it is scoped to. |
| `c_*` | **Conventions** — how we work: gates, verification, git. | Before running checks, or before any git operation. |
| `d_*` | **Domain** — terminology and reference. | Any time the product vocabulary appears. |
| `dec_*` | **Decisions** — one per call already made, with its rationale. | Before proposing a different approach. |
| `s_*` | **State** — what is in flight. Volatile; check the date on it. | At the start of a session. |
| `r_*` | **References** — links out to external truth. | When you need the repo, a PR, or the brief PDF. |

Files: `a_app-structure`, `a_data-and-session`, `a_api-conventions`, `a_ui-kit`,
`a_styling` · `c_workflow`, `c_quality-gates`, `c_testing` · `d_glossary` ·
`dec_001_css-modules-only` … `dec_006_zero-runtime-dependencies` · `s_now` ·
`r_links`. `CLAUDE.local.md` is personal and gitignored.

## Two rules that override convenience

1. **Never `git add`, `commit`, `push`, or open a PR without asking first.**
   Every time — approval of one commit is not approval of the next.
2. **Never settle a decision alone.** Surface the fork, recommend, wait.

Both are elaborated in the file imported below, along with the vocabulary every
screen shares.

@.claude/rules/c_workflow.md

@.claude/rules/d_glossary.md
