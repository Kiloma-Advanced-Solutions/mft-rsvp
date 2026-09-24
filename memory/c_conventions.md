# Conventions

Where each working rule lives. This file is a **router**, not a rulebook — it
tells you which source to open, and that source is authoritative. Nothing here
restates a rule; if you find a rule stated here rather than linked, it is a bug in
this file.

| Area | Authoritative source |
| --- | --- |
| Coding and house style — stack, component placement, explicit props | [CLAUDE.md](../CLAUDE.md) |
| Server vs Client Components — where `"use client"` may go | [CLAUDE.md](../CLAUDE.md) · shape in [a_system.md](a_system.md) |
| Data and permission boundaries — server-only modules, trusted identity, where authorisation belongs | [CLAUDE.md](../CLAUDE.md) · rules in [TASKS.md](../TASKS.md) §4 |
| Seat-taking and the data boundary — anything that can make a registration `going`, or that adds a write under `lib/data/` | [CLAUDE.md](../CLAUDE.md) · protocol in [lib/data/seats.ts](../lib/data/seats.ts) · shape in [a_system.md](a_system.md) "Seat-taking and concurrency" |
| Writing SQL — the SQL Server target, rejected constructs, ownership rules, and what `npm run check:tsql` enforces | [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md) |
| Schema and migration changes | [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md) · runner rules in [lib/data/migrate.mts](../lib/data/migrate.mts) · operating contract in [u_environment.md](u_environment.md) |
| API conventions | [CLAUDE.md](../CLAUDE.md) · helpers in [lib/api.ts](../lib/api.ts) · worked example [app/api/session/route.ts](../app/api/session/route.ts) |
| Styling — tokens, CSS Modules, both themes | [CLAUDE.md](../CLAUDE.md) · tokens in [app/styles/tokens.css](../app/styles/tokens.css) |
| User-facing copy | [CLAUDE.md](../CLAUDE.md) · vocabulary in [lib/labels.ts](../lib/labels.ts) |
| UI language, direction and bidi — Hebrew copy, RTL, logical properties, `dir="auto"` | [a_system.md](a_system.md) "Language and direction" · words in [lib/labels.ts](../lib/labels.ts) · dates in [lib/date.ts](../lib/date.ts) |
| Verification commands | the scripts in [package.json](../package.json), in the order [CLAUDE.md](../CLAUDE.md) requires |
| Definition of done | [TASKS.md](../TASKS.md) §7 |
| Milestone requirements | [TASKS.md](../TASKS.md) §5 |
| What reviewers check, and the traps they look for | [TASKS.md](../TASKS.md) §6 and §10 |
| Pull request expectations | [TASKS.md](../TASKS.md) §8 |
| This version of Next.js — APIs, file structure, deprecations | [AGENTS.md](../AGENTS.md) → `node_modules/next/dist/docs/`, read before writing Next code |
| Claude Code configuration — pre-approved commands, dev server | [.claude/settings.json](../.claude/settings.json) · [.claude/launch.json](../.claude/launch.json) · see [u_environment.md](u_environment.md) |
| Branch and worktree workflow | [u_environment.md](u_environment.md) |
| Implementation truth, always | the source code |

## Two things worth knowing up front

**There is no automated test suite.** `package.json` defines no test runner, and
nothing in the repository is set up to run one. Verification is the command
chain [CLAUDE.md](../CLAUDE.md) requires — it is the authority for which scripts
run and in what order, so the list is not repeated here — plus clicking through
the app as more than one persona. [TASKS.md](../TASKS.md) §7 is the definition
of done. Do not assume tests exist, and do not
introduce a test framework as a side effect of milestone work; adding one is a
decision for [dec_log.md](dec_log.md).

**Verification is persona-based.** Most bugs in this project are only visible
when you switch persona, which is why "run the commands" is not sufficient on its
own. The mechanics are in [u_environment.md](u_environment.md); the persona table
is in [TASKS.md](../TASKS.md) §3.
