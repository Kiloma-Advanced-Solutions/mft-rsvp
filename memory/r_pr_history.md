# r_pr_history — what has merged, and what it taught

One row per merged PR, **newest first**. Append-only and union-merged across
branches, so every row is a self-contained line — never rewrite an existing one.

The "Taught us" column is a pointer, not a summary: it carries the `L-` or `D-`
id from [`dec_log.md`](dec_log.md), or `—` when a PR taught nothing worth
pinning. Most PRs teach nothing. That is fine, and saying so honestly is what
keeps the ones that do teach something readable.

| PR | Merged | What | Taught us |
| --- | --- | --- | --- |
| #1 | 2026-08-17 | Events Board workshop skeleton — design system, UI kit, data layer, session, API conventions | — |

> Rows below the first real feature PR are added in the memory wrap PR that
> follows it, not in the feature PR itself. See
> [`c_memory_protocol.md`](c_memory_protocol.md).
