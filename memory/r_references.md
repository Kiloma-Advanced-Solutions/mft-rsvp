# References

What each source is good for, and whether it is authoritative. This file does not
reproduce any of their contents.

**Authoritative** means: where this source and anything else disagree, this source
wins. **Supporting** means: useful background, safe to skip.

## Specification and rules

| Source | Answers | Standing |
| --- | --- | --- |
| [TASKS.md](../TASKS.md) | What has to be built. §1 the product, §3 what is supplied, §4 the rules (visibility, permissions, registration, capacity, withdrawal), §5 the milestones, §6 the edge cases, §7 done, §8 the PR, §10 review criteria | **Authoritative** — the machine-readable milestone specification |
| [CLAUDE.md](../CLAUDE.md) | How to write code here: stack, styling, component placement, Server/Client split, data and permission boundaries, API house style, copy, and the checks before claiming done | **Authoritative** for conventions |
| [AGENTS.md](../AGENTS.md) | That this Next.js version differs from training data, and to read `node_modules/next/dist/docs/` before writing Next code | **Authoritative** for Next.js usage |

## Code — authoritative for implementation truth

| Source | Answers | Standing |
| --- | --- | --- |
| [lib/types.ts](../lib/types.ts) | The domain model, with the meaning of every role, access mode and status in its doc comments. Read this first when touching the domain | **Authoritative** |
| [lib/session.ts](../lib/session.ts) | Who the current user is. `getCurrentUser()` is the only trusted identity on the server; the persona is a cookie | **Authoritative** |
| [lib/db.ts](../lib/db.ts) | How data is read and written — async, deep-copying, server only. Its header explains why each property exists | **Authoritative** |
| [lib/api.ts](../lib/api.ts) | The route-handler and fetch helpers: `withErrorHandling`, `ApiError`, `jsonOk`, `readJson`, `fetchJson` | **Authoritative** |
| [app/api/session/route.ts](../app/api/session/route.ts) | The API house style end to end. Copy this shape | **Authoritative** worked example |
| [lib/labels.ts](../lib/labels.ts) | The product's vocabulary and badge tones. Import copy from here rather than typing strings into JSX | **Authoritative** for user-facing wording |
| [lib/date.ts](../lib/date.ts) | Date formatting and calendar-day grouping, locale pinned to avoid hydration mismatch | **Authoritative** |
| [lib/seed.ts](../lib/seed.ts) | The fixtures: 12 events, 5 people, every state covered, and the default persona | **Authoritative** for test data |
| [components/ui/](../components/ui/) · [components/events/](../components/events/) · [components/layout/](../components/layout/) | What already exists, and what it expects to be passed | **Authoritative** |
| [app/styles/tokens.css](../app/styles/tokens.css) | Every colour, space, radius, shadow and type size, light and dark | **Authoritative** |

## Orientation and operation

| Source | Answers | Standing |
| --- | --- | --- |
| [README.md](../README.md) | What the project is, how to install and run it, the directory map, and why there is no auth and no database | Supporting — a good first read for a human, superseded by `TASKS.md` on requirements |
| `/styleguide` in the running app | Every component rendered with real data. Check here before building a new component | Supporting, and the fastest way to see the kit |
| `/` in the running app | The start page: what is built and what is yours | Supporting |
| [.claude/launch.json](../.claude/launch.json) | How the dev server is launched — the `events-board` config on port 3000 | **Authoritative** for the dev server |
| [.claude/settings.json](../.claude/settings.json) | Which commands are pre-approved for Claude Code in this repository | **Authoritative** for Claude configuration |
| [package.json](../package.json) | The scripts that verify the work, and the dependency set | **Authoritative** |

See [u_environment.md](u_environment.md) for how to actually use the dev server,
the reset endpoint and the personas.

## Background

| Source | Answers | Standing |
| --- | --- | --- |
| [docs/KAS-WS-0014-01-Events-Board-Workshop-Brief.pdf](../docs/KAS-WS-0014-01-Events-Board-Workshop-Brief.pdf) | The workshop framing behind the exercise | Supporting / background only. **A fresh session should not need to read it** — `TASKS.md` is the authoritative specification. Open it only if the framing itself is in question |
| PR history — `gh pr list`, `gh pr view` | Why a change was made, in the author's words. PR #1 is the skeleton import | Supporting, and the canonical home for per-change narrative ([TASKS.md](../TASKS.md) §8) |
