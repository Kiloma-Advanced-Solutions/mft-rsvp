# dec_log — decisions and pinned lessons

**Append-only. Newest first. Never rewrite an existing entry** — supersede it
with a new one that cites the old id. Union-merged across branches, so every
entry must be a self-contained block (see [`c_memory_protocol.md`](c_memory_protocol.md)).

Ids are stable and never reused: `D-YYYYMMDD-NN` for decisions,
`L-YYYYMMDD-NN` for lessons.

---

# Lessons worth pinning

The engine. Each entry moves from a specific symptom to a rule the team can
apply somewhere it has never been. **The `Generalize:` line is the payload.**

## L-20260820-05 — A symlink can resolve by name and still point at nothing

**Symptom.** `memory-bank.sh check` reported "memory bank healthy" against a
symlink whose target directory had just been deleted. Any write through it would
have failed — the exact false confidence the tool exists to remove.

**Root cause.** The check compared `readlink`'s output to the expected path and
stopped there. That answers "does the link say the right thing", not "does the
link lead anywhere". The inode comparison that would have caught it was skipped,
because the probe file it stats did not exist — a missing input was treated as
"nothing to check" rather than as evidence.

**Fix.** `check` now tests `-d "$BANK"` and fails on a dangling target, and
distinguishes three states in its summary: healthy, linked-but-empty, and
broken. Found by deliberately deleting the target during setup testing, not in
review.

**Generalize:** A verification step that can silently skip its own check is
worse than no check, because it reports success. Whenever a check depends on an
input that might be absent, decide explicitly what absence means — and if it
means "unverified", say so in the result rather than passing. Exercise the
failure paths of any tool whose job is to detect failure; a checker is the one
thing you cannot validate by watching it succeed.

*Context:* found 2026-08-20 while testing the setup · `scripts/memory-bank.sh` · relates to `D-20260820-03`

---

## L-20260820-04 — A git ignore rule in `.git/info/exclude` protects only you

**Symptom.** `.claude/worktrees/` was correctly ignored on this machine, and the
worktree architecture appeared to be set up. A teammate cloning the repo would
have had every disposable session tree show up as untracked noise, and would
eventually have committed one.

**Root cause.** The rule lived in `.git/info/exclude`, which is local to a single
clone and is never pushed. Nothing about the working setup revealed this —
`git check-ignore` reports success identically either way.

**Fix.** Moved the rule into the committed `.gitignore`. Verified with
`git check-ignore -v .claude/worktrees`, which now names `.gitignore` as the
source, not `.git/info/exclude`.

**Generalize:** When something has to hold for the whole team, check *where* the
mechanism lives, not just that it works locally. For ignore rules,
`git check-ignore -v <path>` names the file the rule came from — if that is
`.git/info/exclude`, only you are protected. The same question applies to git
config, hooks and editor settings: "would a fresh clone have this?"

*Context:* found while setting up the memory bank, 2026-08-20 · `.gitignore` · relates to `D-20260820-01`

---

## L-20260820-03 — Worktree sessions share the main clone's memory path

**Symptom.** Uncertainty about whether each worktree session gets its own memory
directory — which would silently fragment the bank across sessions, exactly what
the symlink is meant to prevent.

**Root cause.** Claude Code derives *two* different per-project directories under
`~/.claude/projects/`. It was not obvious which one memory uses.

**Fix.** Verified directly on 2026-08-20: a session running in
`.claude/worktrees/<name>/` was given the memory path derived from the **main
clone** (`-Users-…-mft-rsvp/memory/`), while its *transcript* was written to the
worktree-derived directory (`-Users-…-mft-rsvp--claude-worktrees-<name>/`).
Memory is main-clone scoped; transcripts are per-worktree.

**Generalize:** One symlink at the main-clone-derived path serves every session
on the machine — you do not need to link per worktree. Do not assume it stays
that way across Claude Code versions:
`./scripts/memory-bank.sh check` scans for stray real `memory/` directories
under other project paths and flags a forked bank if the behaviour ever changes.

*Context:* verified 2026-08-20 · `scripts/memory-bank.sh` · `c_worktrees.md`

---

## L-20260820-02 — Editing memory inside a worktree writes into a void

**Symptom.** A memory file edited during a session was missing in the next one.
The edit had appeared to succeed; nothing errored. Cost this project real work
across PRs #71–73, including a lost file.

**Root cause.** A git worktree has its own checkout. `memory/…` *inside* a
worktree path is a different file from the one the home symlink resolves to.
Writing there is orphaned — it rides a throwaway branch or vanishes with the
worktree.

**Fix.** Route every memory write through the home-symlink path or the main
clone, and prove the link with an inode comparison before the first write.

**Generalize:** Whenever two paths are supposed to be the same file, verify it
rather than assume it — `stat` the inode on both. Applies to symlinks, bind
mounts, container volume mappings and editor "open recent" paths alike. If the
inodes differ, stop before writing, not after.

*Context:* from the Part 2 training deck, incident PRs #71–73 · `c_worktrees.md` · run `./scripts/memory-bank.sh check`

---

## L-20260820-01 — An issue key in a chore PR title silently closed an unrelated issue

**Symptom.** A wrap-up PR merged and an unrelated tracker issue flipped to
"Done". Nobody had touched that issue, and the PR did not claim to complete it.

**Root cause.** The issue key `KIL-NNN` appeared in the wrap PR's title. The
tracker's GitHub automation matches keys anywhere in a PR's title, branch name
or commit messages, and auto-completes the issue on merge. Mentioning an issue
and completing one are indistinguishable to that automation.

**Fix.** Removed the key from the wrap PR's title, branch and commits, and
reopened the issue.

**Generalize:** Keep `KIL-NNN` out of any wrap, chore or memory PR unless that
PR genuinely completes the issue — reference it in the body prose instead, where
automation does not look. After merging any PR that mentions issue keys it does
not complete, spot-check those issues. More broadly: assume any identifier you
put in a branch name, commit or PR title may be acted on by automation you did
not configure.

*Context:* from the Part 2 training deck · `c_conventions.md` § Git

---

# Decisions

## D-20260820-04 — `CLAUDE.md` bootstraps, `c_conventions.md` is canonical

**Context.** `CLAUDE.md` is loaded into every session automatically, so it is the
only reliable way to make a fresh session aware the bank exists. But it is also
the natural place to accumulate rules — and then it duplicates
`c_conventions.md` and the two drift.

**Options.** (a) Move everything into `CLAUDE.md` and drop `c_conventions.md`.
(b) Empty `CLAUDE.md` down to a pointer. (c) Split by job, and name one file the
authority.

**Decision.** (c). `CLAUDE.md` is the *bootstrap*: the reading order, plus the
handful of rules that must be in context before any file is read. It states
explicitly that `c_conventions.md` wins on conflict. `c_conventions.md` is the
complete set, with rationale and verification steps.

**Consequences.** A small, deliberate overlap remains between the two files. It
is bounded and one-directional: `CLAUDE.md` may only ever be a strict, correct
subset. When a rule changes, `c_conventions.md` changes first and `CLAUDE.md` is
reconciled in the same wrap PR.

---

## D-20260820-03 — The inode check is a script and a hook, not a habit

**Context.** The training deck teaches `ls -lai` on both paths and comparing
inodes by eye. That is correct and it is exactly the kind of step people skip
when they are in a hurry — which is precisely when the trap bites.

**Options.** (a) Documentation only, as taught. (b) A script. (c) A script plus
a `SessionStart` hook that runs it automatically.

**Decision.** (c). `./scripts/memory-bank.sh` does `link` / `check` / `where`,
and `.claude/settings.json` runs `check --quiet` at session start.

**Consequences.** The check reports rather than blocks — in `--quiet` mode it
prints one line and always exits 0, so a broken bank can never stop a session
from starting. It also catches things eyeballing two `ls` outputs would not: a
symlink pointing at the wrong target, stray forked `memory/` directories under
other project paths, and `s_status.md` drifting more than three commits behind
master. The hook is in the committed settings file, so the whole team inherits
it; anyone who dislikes it can remove that one block.

---

## D-20260820-02 — Append-only logs are union-merged

**Context.** Many branches consume *and* update this bank at once — the repo
already carries a dozen teammate branches. `dec_log.md` and `r_pr_history.md`
are append-only, so two branches each adding an entry would conflict on every
merge, at exactly the same lines, forever.

**Options.** (a) Live with the conflicts. (b) One memory branch, serialised.
(c) `merge=union` on the append-only logs.

**Decision.** (c), via `.gitattributes`. Both sides' insertions survive a merge
without a conflict.

**Consequences.** Two properties the team has to know, documented in
`c_memory_protocol.md`: entries must be self-contained blocks because their
relative order after a union merge is arbitrary; and union merge silently keeps
*both* versions if two branches edit the same entry, so existing entries are
never rewritten — they are superseded by a new entry citing the old id. Volatile
`s_` files are deliberately **not** union-merged: they describe "now", where
last-writer-wins is the correct semantic.

---

## D-20260820-01 — The bank lives in the repo; the home path is the symlink

**Context.** The bank must be git-tracked so it ships with the repo to every
teammate, and it must also be readable and writable at the path Claude Code uses
for memory: `~/.claude/projects/<mangled-path>/memory/`.

**Options.** (a) Real bank at the home path, copied into the repo. (b) Real bank
at the home path, repo symlinks out to it. (c) Real bank in the repo, home path
symlinks into it.

**Decision.** (c). The bank is `<main clone>/memory/`; the home path is a symlink
into it, created by `./scripts/memory-bank.sh link`.

**Consequences.** The home path contains the operator's username and the clone's
absolute location, so it is machine-specific and could never be tracked or
shared — (a) and (b) both fail for a team, and (a) forks the bank the moment two
sessions run. Under (c) the bank is reviewable in PRs like any other source, and
`link` is a one-line per-machine setup step. The cost: the symlink is not in git,
so each machine runs `link` once. `check` catches a machine that never did.

*Supersedes nothing. See `c_worktrees.md` for the resulting architecture.*
