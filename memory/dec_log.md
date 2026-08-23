# Decision Log

Append-only record of cross-cutting implementation decisions and the reasoning
behind them, for decisions whose rationale would otherwise be lost.

## When a decision belongs here

Add an entry when all three are true:

- several reasonable options existed;
- one was deliberately chosen;
- understanding *why* will matter to a later milestone or review.

Do not add:

- architecture facts that already have a home — those belong in
  [a_system.md](a_system.md) or the code;
- routine implementation detail with no real alternative;
- a **planned** decision written up as though it were done. An entry is added
  after the decision is implemented, not when it is proposed.

## Where decisions live instead

Much of this project's rationale is already written where it applies, and stays
there:

- the async, deep-copying, `globalThis`-backed store →
  [lib/db.ts](../lib/db.ts) header;
- cookie personas instead of authentication →
  [lib/session.ts](../lib/session.ts) header;
- the locale pinned to `en-GB` to avoid hydration mismatch →
  [lib/date.ts](../lib/date.ts) header;
- route handlers rather than Server Actions, and the styling rules →
  [CLAUDE.md](../CLAUDE.md).

This log links to those rather than restating them. Per-change narrative belongs
in the pull request description ([TASKS.md](../TASKS.md) §8).

## Entry format

```text
## YYYY-MM-DD — Decision title

Context:
Decision:
Rationale:
Consequences:
```

Entries are appended newest-last. Existing entries are never edited; if a
decision is reversed, add a new entry that references the one it supersedes.

---

## 2026-08-20 — Memory Bank as MEMORY.md plus a four-file `memory/`

Context: the repository has four strong authoritative files (`TASKS.md`,
`CLAUDE.md`, `README.md`, and a heavily commented `lib/`), but nothing that routes
a fresh session to the right one, and nowhere to record volatile project position.
Three structures were on the table: a single `MEMORY.md` holding everything; the
full `a_/c_/d_/dec_/s_/r_/u_` taxonomy; or a reduced middle ground.

Decision: one root `MEMORY.md` for navigation, plus `memory/` holding exactly
`a_system.md`, `d_glossary.md`, `dec_log.md` and `s_status.md`. The taxonomy files
that would have been mostly links were not created — conventions stay in
`CLAUDE.md`, the backlog stays in `TASKS.md`, references are the navigation index
itself, and environment facts stay in `.claude/*`, `README.md` and `TASKS.md`.

Rationale: the single-file version mixes stable orientation with volatile status,
so routine status edits would churn the whole file. The full taxonomy creates
files whose content is a paraphrase of an existing authoritative file, which is
how documentation goes stale. Four files draw the line at the four kinds of memory
the repository genuinely lacks: system shape, terminology, rationale, and current
state.

Consequences: `s_status.md` is the only file expected to change routinely, and it
is rewritten in place rather than appended to. Everything else changes only when
the thing it describes changes. Adding a fifth memory file needs a reason that
`MEMORY.md`, an existing memory file, or a repository file cannot already serve.

---

## 2026-08-23 — Complete taxonomy and move MEMORY.md into memory/

Context: after reviewing the Memory Bank methodology, we decided to represent all
seven taxonomy categories rather than only the four the previous entry selected.
The concern that drove that earlier choice — files whose content is a paraphrase of
an authoritative source — is answered by keeping the additional files lightweight
and routing-oriented rather than by omitting them.

Decision: `MEMORY.md` lives inside `memory/`, so the Memory Bank is one directory
with a single entry point and no root-level duplicate. All seven taxonomy
categories are represented: `a_system.md`, `c_conventions.md`, `d_glossary.md`,
`dec_log.md`, `s_status.md`, `r_references.md` and `u_environment.md`.
`c_conventions.md`, `r_references.md` and `u_environment.md` are intentionally
lightweight and primarily point to authoritative repository sources rather than
explaining anything themselves.

Rationale: this preserves the full Memory Bank taxonomy while still enforcing the
principles that made the reduced structure attractive — one home per fact,
references over duplication, progressive disclosure in the reading order, and
existing repository files as the authoritative sources of truth. A category earns
a file; it does not earn content it does not own.

Consequences: this entry supersedes the Memory Bank structure described in the
2026-08-20 entry above, which does not invalidate that entry's historical
rationale — the reasoning about paraphrase and staleness still governs how the
three added files are kept small. `MEMORY.md` is referenced as `memory/MEMORY.md`
from here on, and the three lightweight files are held to a routing-only standard:
if one starts explaining rather than pointing, the explanation belongs in its
authoritative source instead.

---

No product decisions are recorded yet because M1 has not been implemented. Future
entries should be added only after a significant implementation decision has been
approved and implemented. The decision log records decisions after they are made;
it does not predict them.
