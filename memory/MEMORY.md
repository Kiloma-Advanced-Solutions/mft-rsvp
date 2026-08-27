# Memory Bank

## Purpose

This is the entry point for a fresh Claude Code session working on the Events
Board. Its job is **navigation**: it tells you which file answers a question, so
you do not have to rediscover the repository.

It deliberately does not restate what those files say. Every fact has **one
home**, and the repository is authoritative — where memory and code disagree,
the code is right and the memory is stale.

## Fresh Session Reading Order

Progressive disclosure. Read the smallest amount that lets you start, then
navigate deeper only when the task actually needs it.

1. **`memory/MEMORY.md`** (this file) — to know where things are.
2. **[memory/s_status.md](s_status.md)** — where the project is right now.
3. **[CLAUDE.md](../CLAUDE.md)** — before implementation. House style, non-negotiable.
4. **[TASKS.md](../TASKS.md)** — the section for the active milestone, when implementing it.
5. **Additional memory on demand** — load `a_`, `c_`, `d_`, `dec_`, `r_` or `u_`
   files only when the current task requires them, via the index below.

Do **not** load the whole Memory Bank by default. Steps 1–2 are always cheap;
steps 3–4 apply before implementation; step 5 is task-driven.

## Memory Bank Taxonomy

All seven categories of the methodology, one file each.

| Category | File | Job | Changes when |
| --- | --- | --- | --- |
| `a_` Architecture | [a_system.md](a_system.md) | System map: how the pieces relate, which boundaries must not be crossed | The architecture changes |
| `c_` Conventions | [c_conventions.md](c_conventions.md) | Where each working rule lives, and how we work here | A convention's home moves |
| `d_` Domain | [d_glossary.md](d_glossary.md) | Domain terminology — conceptual meaning, not type shape | A stable new term appears |
| `dec_` Decisions | [dec_log.md](dec_log.md) | Append-only rationale for implemented decisions | A real decision is made and implemented |
| `s_` State | [s_status.md](s_status.md) | Where the project is right now. The volatile file | Every milestone |
| `r_` References | [r_references.md](r_references.md) | What each authoritative and supporting source is good for | A source is added or retired |
| `u_` User / Operator | [u_environment.md](u_environment.md) | Operating and development-environment context | The dev setup changes |

Navigation itself is this file. A complete taxonomy is not licence for large
files — see Memory Discipline below.

## Question → Source Navigation Index

Memory Bank files give you orientation. Repository files marked **authoritative**
are the truth.

### Orientation

| Question | Where |
| --- | --- |
| What is this product, and how is the system structured? | [a_system.md](a_system.md) · source code is authoritative |
| How do I run it, and what is already built? | [u_environment.md](u_environment.md) · [README.md](../README.md) · [TASKS.md](../TASKS.md) §3 |
| What are we working on right now? | [s_status.md](s_status.md) |
| Why was a particular implementation approach chosen? | [dec_log.md](dec_log.md) · then the source file's header comment, then PR history (`gh pr list`) |
| Which source should I open for question X? | [r_references.md](r_references.md) |

### Domain and rules

| Question | Where |
| --- | --- |
| What do "host", "invite", "pending", "full" mean? | [d_glossary.md](d_glossary.md) |
| What are the exact domain types? | [lib/types.ts](../lib/types.ts) — **authoritative** |
| Who may see an event? Who may manage it? What happens when someone registers? | [TASKS.md](../TASKS.md) §4 — **authoritative** for the rules · [lib/permissions.ts](../lib/permissions.ts) — the implementation of visibility, manageability and registration availability |
| What are the milestone requirements and the backlog? | [TASKS.md](../TASKS.md) §5 — **authoritative** |
| Which mistakes are reviewers looking for? | [TASKS.md](../TASKS.md) §6 |

### Conventions and code

| Question | Where |
| --- | --- |
| How is work performed in this repository? | [c_conventions.md](c_conventions.md) → routes to each authoritative source |
| How should Claude write code here? | [CLAUDE.md](../CLAUDE.md) — **authoritative** |
| Anything about this version of Next.js | [AGENTS.md](../AGENTS.md) → `node_modules/next/dist/docs/` — read before writing Next code |
| Who is the current user? Can I trust an identity? | [lib/session.ts](../lib/session.ts) — `getCurrentUser()`, the only trusted identity, server only |
| Where does data come from? | [lib/db.ts](../lib/db.ts) — async in-memory store, server only · fixtures in [lib/seed.ts](../lib/seed.ts) |
| What are the API conventions? | [lib/api.ts](../lib/api.ts) + [app/api/session/route.ts](../app/api/session/route.ts) as the worked example |
| How are dates formatted and grouped? | [lib/date.ts](../lib/date.ts) |
| What words does the product use? | [lib/labels.ts](../lib/labels.ts) |

### Building UI

| Question | Where |
| --- | --- |
| What are the styling conventions? | [CLAUDE.md](../CLAUDE.md) (the rules) + [app/styles/tokens.css](../app/styles/tokens.css) (the tokens) |
| Which components already exist? | [components/ui/index.ts](../components/ui/index.ts) · [components/events/](../components/events/) · [components/layout/](../components/layout/) — all rendered at `/styleguide` |
| Server or Client Component? | [CLAUDE.md](../CLAUDE.md) · [a_system.md](a_system.md) for the data-flow shape |

### Running and verifying

| Question | Where |
| --- | --- |
| How do I run the dev server, reset data, or switch persona? | [u_environment.md](u_environment.md) |
| Which commands verify my work? | the scripts in [package.json](../package.json), run in the order [CLAUDE.md](../CLAUDE.md) requires |
| Which personas do I switch between to test visibility? | [TASKS.md](../TASKS.md) §3 · seeded in [lib/seed.ts](../lib/seed.ts) |
| What counts as done? | [TASKS.md](../TASKS.md) §7 — **authoritative** |

## Memory Discipline

- **One home per fact.** Requirements and milestones → `TASKS.md`. Coding and
  operating conventions → `CLAUDE.md`. Exact domain types → `lib/types.ts`.
  Implementation truth → source code. Terminology → `d_glossary.md`. System
  shape → `a_system.md`. Decision rationale → `dec_log.md`. Current state →
  `s_status.md`. Navigation → this file.
- **References over duplication.** When a memory file needs a fact owned
  elsewhere, it links. No rule tables, type definitions, or command strings are
  reproduced here.
- **Glossary first.** A stable domain term is defined in `d_glossary.md` and
  referenced from everywhere else. Never define the same term twice.
- **Stable rules stay in their authoritative files.** `CLAUDE.md` owns coding and
  house style; `TASKS.md` owns requirements and milestones. The Memory Bank adds
  orientation, terminology, state and decision memory — it never competes.
- **Volatile state lives only in `s_status.md`**, and that file is rewritten in
  place. It is current state, not a changelog.
- **`dec_log.md` is append-only**, records only significant *implemented*
  decisions, and holds *why* rather than *what*. Rationale already written in a
  source file's header comment stays there and is linked. A reversal is a new
  entry referencing the old one.
- **Small taxonomy files stay small.** `c_conventions.md`, `r_references.md` and
  `u_environment.md` are navigational by design; if one starts explaining rather
  than routing, the explanation belongs in its authoritative source instead.
- **A category is not a reason to write.** Obsolete temporary information is
  removed rather than accumulated in active memory; there is no archive
  directory until something genuinely needs one.
- **Separate from personal memory.** Claude's personal/project memory under
  `~/.claude/` is a different system. Nothing here governs it, and this Memory
  Bank does not live there.
