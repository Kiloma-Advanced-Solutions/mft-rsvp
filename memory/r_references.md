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
| [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md) | The SQL Server target, what `check:tsql` enforces and what it cannot, the seat-claim protocol, and the shared-database safety rules. Read before writing any SQL | **Authoritative** — its contract sections constrain what may be merged |

## Code — authoritative for implementation truth

| Source | Answers | Standing |
| --- | --- | --- |
| [lib/types.ts](../lib/types.ts) | The domain model, with the meaning of every role, access mode and status in its doc comments. Read this first when touching the domain | **Authoritative** |
| [lib/session.ts](../lib/session.ts) | Who the current user is. `getCurrentUser()` is the only trusted identity on the server; the persona is a cookie | **Authoritative** |
| [lib/db.ts](../lib/db.ts) | The persistence boundary over SQL Server, server only: the store contract product code relies on, the application's ownership of ids and timestamps, and why registration writes are narrowed. Its header explains each | **Authoritative** |
| [lib/data/](../lib/data/) | The SQL itself — one module per concern, the row ↔ domain translation, the connection pool in `client.ts`, and the migrate and seed/reset CLIs | **Authoritative** |
| [lib/data/seats.ts](../lib/data/seats.ts) | The seat-claim protocol: the only application-runtime path that may produce `going`, and why capacity is a transaction protocol rather than a constraint | **Authoritative** |
| [migrations/](../migrations/) | The schema, and the constraints the database itself enforces | **Authoritative** |
| [lib/api.ts](../lib/api.ts) | The route-handler and fetch helpers: `withErrorHandling`, `ApiError`, `jsonOk`, `readJson`, `fetchJson`, and `RequestError`, which `fetchJson` throws with the HTTP status | **Authoritative** |
| [app/api/session/route.ts](../app/api/session/route.ts) | The API house style end to end. Copy this shape | **Authoritative** worked example |
| [lib/labels.ts](../lib/labels.ts) | The product's Hebrew vocabulary and badge tones — the display label for every domain value, plus the app frame, the UI kit's own words and the API's generic refusal messages. Import copy from here rather than typing strings into JSX | **Authoritative** for user-facing wording |
| [lib/date.ts](../lib/date.ts) | Date, duration and relative-day formatting, and calendar-day grouping. The locale is pinned to `he-IL` to avoid a hydration mismatch, and the Hebrew wording of durations and relative days lives here rather than in `lib/labels.ts`. The `formatEmail*` functions are the email's own, pinned to Asia/Jerusalem | **Authoritative** |
| [lib/seed.ts](../lib/seed.ts) | The single definition of the fixtures — 12 events, 5 people, every state covered, the default persona and the persona order. The seed tooling loads them into SQL; the application reads only the fixed ids and the persona order | **Authoritative** for test data |
| [components/ui/](../components/ui/) · [components/events/](../components/events/) · [components/layout/](../components/layout/) | What already exists, and what it expects to be passed | **Authoritative** |
| [app/styles/tokens.css](../app/styles/tokens.css) | Every colour, space, radius, shadow and type size, light and dark, and the font stack, Rubik first | **Authoritative** |
| [lib/shareLinks.ts](../lib/shareLinks.ts) | How an event's share link is built, and why its origin is configuration rather than the request | **Authoritative** |
| [lib/services/](../lib/services/) · [lib/emails/](../lib/emails/) | Sending email: the organization's transport and its sender configuration in `emailService.ts`, the event-share send, and the email content model, plain-text part and address check | **Authoritative** |
| [emails/](../emails/) | The React Email shell and templates. The headers of `BaseEmail/BaseEmail.tsx` and `BaseEmail/BaseEmailStyles.ts` explain the Outlook 2016 constraints and the email styling exception | **Authoritative** for email markup |
| [scripts/base64convertor.mts](../scripts/base64convertor.mts) | Turning an image into a `data:` URI module in `emails/images/`. Usage is in its header | **Authoritative** |

## Orientation and operation

| Source | Answers | Standing |
| --- | --- | --- |
| [README.md](../README.md) | What the project is, how to install and run it, the directory map, why there is no auth, and "The database": setup from a fresh checkout, the read-only checks, reset, and the shared-database safeguards | Supporting — a good first read for a human, superseded by `TASKS.md` on requirements. **Authoritative** for the database workflow and its commands |
| [docs/pre-m11-stabilization-plan.md](../docs/pre-m11-stabilization-plan.md) | The approved pre-M11 work: the eleven requested changes and their confirmed requirements, the six branches C1–C6 with their boundaries and order, decisions H1–H3, the technical findings and risks per branch, and the per-branch workflow. Read the section for the branch you are implementing | Supporting, **temporary** — a plan, not implemented behaviour; where it and the code disagree about what is built, the code wins. Deleted by the last of its branches once its rules are in `TASKS.md` and `dec_log.md` |
| [.env.example](../.env.example) | Which environment variables exist, what each means, and where each may and may not be set | **Authoritative** for configuration |
| `/styleguide` in the running app | Every component rendered with real data. Check here before building a new component | Supporting, and the fastest way to see the kit |
| `/` in the running app | The start page: what is built and what is yours | Supporting |
| [.claude/launch.json](../.claude/launch.json) | How the dev server is launched — the `events-board` config on port 3000 | **Authoritative** for the dev server |
| [.claude/settings.json](../.claude/settings.json) | Which commands are pre-approved for Claude Code in this repository | **Authoritative** for Claude configuration |
| [package.json](../package.json) | The scripts — verification, the SQL checks, the database CLIs and the email preview — and the dependency set | **Authoritative** |

See [u_environment.md](u_environment.md) for how to actually use the dev server,
the database workflow and the personas.

## Background

| Source | Answers | Standing |
| --- | --- | --- |
| [docs/KAS-WS-0014-01-Events-Board-Workshop-Brief.pdf](../docs/KAS-WS-0014-01-Events-Board-Workshop-Brief.pdf) | The workshop framing behind the exercise | Supporting / background only. **A fresh session should not need to read it** — `TASKS.md` is the authoritative specification. Open it only if the framing itself is in question |
| The organization's reference email implementation | The source the transport, the email shell, the palette and the image convention were adapted from | Cited in the headers under `emails/`, `lib/services/` and `scripts/`, but **not in this repository**, and its location is not recorded here. What was taken from it, and what was changed, is in those headers |
| PR history — `gh pr list`, `gh pr view` | Why a change was made, in the author's words. PR #1 is the skeleton import | Supporting, and the canonical home for per-change narrative ([TASKS.md](../TASKS.md) §8) |
