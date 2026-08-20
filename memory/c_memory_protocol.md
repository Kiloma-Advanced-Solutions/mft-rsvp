# c_memory_protocol — how to use and maintain the bank

The taxonomy and the index are in [`MEMORY.md`](MEMORY.md). This file is the
*operating* protocol: how a session opens, how it closes, and how knowledge gets
in without the bank rotting or two branches fighting over it.

---

## Opening a session

1. `./scripts/memory-bank.sh check` — before any memory write. The `SessionStart`
   hook runs it for you; read what it says.
2. Read in the order in [`MEMORY.md`](MEMORY.md): `s_status` → `s_backlog` →
   `u_<operator>` + `c_conventions` → drill down via the index.
3. Say back, in one or two lines, what you understand the current state and the
   task to be. A wrong plan costs thirty seconds; wrong code costs ten minutes.

**Read narrowly.** The index exists so you can pull the two files a task needs
instead of the whole bank. Loading everything is how a bank stops paying for
itself.

---

## Closing a session — the part everyone skips

**The session is not done when the code merges. It is done when the lesson is
pinned.**

Ask three questions:

1. **Did I hit a wall, get corrected, or discover a gotcha?** → pin a lesson to
   `dec_log.md`.
2. **Did I make a call someone else would have made differently?** → pin a
   decision to `dec_log.md`.
3. **Did anything about the project's state change?** → refresh `s_status.md`
   and `s_backlog.md`.

Then the mechanical updates: `r_pr_history.md` gets a row; new terms go to
`d_glossary.md`; new rules go to `c_conventions.md`.

If the answer to all three is genuinely no, write nothing. An empty wrap is
better than filler — noise is what makes the next session stop reading.

---

## Pinning a lesson

A lesson that stops at "we fixed it" helps nobody. **The rule line is the
payload**: it is what a future session, in unrelated code, can actually apply.

Four parts. Prepend to the "Lessons worth pinning" section of `dec_log.md`,
newest first:

```markdown
## L-YYYYMMDD-NN — <one-line title>

**Symptom.** What was observed, concretely. What did it look like from outside?

**Root cause.** Why it actually happened — not the first plausible story.

**Fix.** What was changed, specifically enough to find in the diff.

**Generalize:** The rule a future session applies somewhere this has never
happened. Written as an instruction, not a description.

*Context:* PR #NN · files touched · related `L-`/`D-` ids
```

The `Generalize:` line is the test of a good lesson. If it only makes sense in
the code you just touched, it is a changelog entry, not a lesson. Push it up one
level of abstraction until it would help someone in a different file.

Decisions use the same shape with a `D-` prefix and **Context / Options /
Decision / Consequences** instead.

**IDs are stable and never reused.** `NN` is a two-digit counter within the day.
Other docs cite lessons by id (`see L-20260820-01`), so the id has to keep
meaning what it meant.

---

## Where a fact goes

One home per fact. When in doubt, the more stable file wins and the volatile one
links to it.

| The fact | Its home |
| --- | --- |
| A rule about how we write code | `c_conventions.md` |
| A rule about the bank or worktrees | `c_memory_protocol.md` / `c_worktrees.md` |
| What a word means | `d_glossary.md` — **first**, then reference it elsewhere |
| A choice and its rationale | `dec_log.md` (`D-`) |
| A gotcha and its generalised rule | `dec_log.md` (`L-`) |
| How the system is put together | `a_system.md` |
| What is in flight right now | `s_status.md` |
| What to do next | `s_backlog.md` |
| A link to something outside the repo | `r_references.md` |
| A merged PR and what it taught | `r_pr_history.md` |
| How one person likes to work | `u_<name>.md` |

Files under ~50 lines fold into an existing file. Create a new top-level doc
reluctantly — proliferation is the failure mode this taxonomy exists to prevent.

Retired docs move to `archive/`, they are not deleted. History is cheap;
re-deriving a decision is not.

---

## The memory wrap PR

Memory updates ship as **their own PR**, after substantive feature work — never
mixed into the feature diff. A reviewer reading a feature diff should not have
to skip past status churn, and memory that lands separately can be corrected
without reopening the feature.

**Branch:** `chore/memory-update-YYYY-MM-DD`
**Cadence:** one wrap PR per one-to-three substantive feature PRs — the moment
the lesson density is worth it.

Updated together, in one PR:

| File | What changes |
| --- | --- |
| `s_status.md` | refreshed to the post-merge state, freshness line re-stamped |
| `s_backlog.md` | shipped items marked done, next sequence set |
| `dec_log.md` | the session's pinned lessons and decisions |
| `r_pr_history.md` | a row per merged PR |
| `c_` / `d_` docs | new conventions or terms, as discovered |

**Why it matters:** the next session opens on accurate state — not memory that
quietly drifted three PRs behind master.

`./scripts/memory-bank.sh check` reads the freshness line at the top of
`s_status.md` and warns when master has moved more than three commits past the
commit the status was verified against. That warning *is* the cadence.

### Cut the wrap PR from the main clone

The bank lives in the main clone, and that is where your memory edits already
are. So:

```bash
cd "$(git rev-parse --path-format=absolute --git-common-dir)/.."
git checkout -b chore/memory-update-$(date +%Y-%m-%d)
git add memory/
git commit -m "chore(memory): pin lessons from <what shipped>"
```

Do **not** try to commit memory edits from a feature worktree — its `memory/` is
the orphan copy. See [`c_worktrees.md`](c_worktrees.md).

---

## Many branches, one bank

Several people and sessions consume and update this bank at once. Three rules
keep that from turning into merge pain.

**1. Append-only logs are union-merged.** `.gitattributes` marks `dec_log.md`
and `r_pr_history.md` `merge=union`, so two branches each adding an entry
produce both entries instead of a conflict. Two consequences to know:

- Entries must be **self-contained blocks** separated by blank lines. Union
  merge keeps each side's insertion whole, but their relative order is
  arbitrary — re-sort by id after a merge if it matters. Never rely on a line
  being adjacent to a line another branch might touch.
- Union merge is **not** conflict detection. If two branches edit the *same*
  entry, you get both versions silently. Never rewrite an existing entry on a
  branch; correct it with a new entry that supersedes it, citing the old id.

**2. Volatile files are last-writer-wins, so refresh them late.** `s_status.md`
and `s_backlog.md` describe *now*. Rewrite them at wrap time from the actual
post-merge state rather than editing them mid-branch and merging stale claims.

**3. Structure changes go through review.** Adding a file, renaming a prefix, or
changing this protocol is a normal PR against the bank — not a write through the
symlink. Contents through the link; container through a PR.

---

## Keeping it honest

- **Write what was surprising, not what is derivable.** If the code, the git
  history or `TASKS.md` already says it, the bank does not need to.
- **Absolute dates, always.** "Last week" is meaningless to the session that
  reads it in November.
- **Cite the evidence.** A claim about behaviour names the file, the PR or the
  command that shows it. A memory bank that cannot be checked becomes a memory
  bank nobody trusts.
- **Correct, don't accumulate.** When a pinned lesson turns out to be wrong, add
  a superseding entry and mark the old one — do not leave two live rules that
  contradict each other.
