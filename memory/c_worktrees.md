# c_worktrees — worktrees, the symlink, and the orphan-edit trap

## Why worktrees

A git worktree is a second working directory on its own branch. One per Claude
Code session buys three things:

- **Isolation.** Each session edits its own tree. A half-finished change can
  never contaminate another session or the main clone.
- **Parallelism.** Several sessions run at once — each in its own worktree, its
  own branch — without stepping on one another.
- **Clean history.** One worktree, one branch, one PR. The session's work is a
  tidy unit from the first commit to the merge.

The catch: **a worktree is disposable, but the memory bank must not be.** That
tension is what the symlink resolves.

## The architecture

```
MAIN CLONE  /Users/<you>/WebDeveloper/mft-rsvp
  memory/                    ← the one real bank. git-tracked, ships with the repo.
  .claude/worktrees/         ← git-ignored; disposable session trees live here

HOME (per machine, not in git)
  ~/.claude/projects/<mangled-main-clone-path>/memory  ──symlink──▶  <main clone>/memory/
```

Claude Code stores memory at a **home** path whose name is the main clone's
absolute path with `/` and `.` replaced by `-`. That path is machine-specific —
it contains your username — so it can never itself be git-tracked. Hence the
direction of the link: the machine-specific path is the symlink, the repo holds
the real files.

**One bank, many windows onto it.** Worktrees come and go; the bank persists in
the main clone and ships with the repo.

### Worktree sessions resolve to the same bank

Verified on Claude Code, 2026-08-20: a session running in
`.claude/worktrees/<name>/` is given the memory path derived from the **main
clone**, not from the worktree. Session *transcripts* are stored per-worktree;
*memory* is not. One symlink therefore serves every session on the machine.

## Setup — once per machine, per clone

```bash
./scripts/memory-bank.sh link
```

Idempotent. It creates or repoints the symlink, and never deletes files: if it
finds a real directory where the symlink belongs, it moves it aside to
`memory.orphan-<timestamp>` and tells you to fold anything valuable in.

## The orphan-edit trap

**This is the most expensive mistake in the whole methodology.** It has cost
this project real work before (PR #71–73 lost a file to it).

```bash
# the trap
cd .claude/worktrees/foo/
vim memory/dec_log.md        # ← the worktree's OWN checkout of memory/
```

A worktree has its own checkout. `./memory/dec_log.md` inside a worktree is a
**different file** from the one the symlink resolves to. The edit looks like it
worked. It is orphaned — it lands on a throwaway branch, or vanishes with the
worktree.

### The rule

Edit memory **only** through the home-symlink path or the main clone. Both
resolve to the one real file.

```bash
./scripts/memory-bank.sh where     # prints the safe paths
```

### The proof — check the inode, don't assume

```bash
./scripts/memory-bank.sh check
```

It compares inodes on both paths and reports a match or a mismatch. By hand:

```bash
ls -lai <main clone>/memory/MEMORY.md \
        ~/.claude/projects/<mangled>/memory/MEMORY.md
```

Identical inode → the link is real. Different inode → **stop.** You are about to
write a memory edit into a void. Re-establish the symlink before you touch a
memory file.

Make the check a reflex, not an afterthought. It runs automatically at session
start via the `SessionStart` hook in `.claude/settings.json`, and it is the
first line of [`MEMORY.md`](MEMORY.md) for a reason.

## Recovery drill

Worth doing on purpose once. A trap you have recovered from, you will never walk
a teammate into.

1. **Create** a worktree off `origin/master` on a session branch. Confirm
   `.claude/worktrees/` is git-ignored (it is, in the committed `.gitignore`).
2. **Link** the bank: `./scripts/memory-bank.sh link`.
3. **Verify** the inode: `./scripts/memory-bank.sh check` — expect a match.
4. **Break it on purpose:** edit `memory/MEMORY.md` *inside* the worktree path.
   Then read the file through the home-symlink path. Your edit is not there.
5. **Diagnose and recover:** re-apply the edit through the home-symlink path,
   re-run `check`, and confirm it landed in the real bank. Revert the orphaned
   copy in the worktree so it does not ride along in your feature diff.

### Symptoms, so you recognise it calmly

- A lesson you are certain you pinned is missing from the next session.
- `git status` in the main clone is clean, but the worktree shows `memory/` as
  modified when you never meant to change it there.
- `check` reports an inode mismatch, or a stray `memory/` directory under
  `~/.claude/projects/`.

## Editing the bank as a source change

There is one legitimate exception, and it is not an exception to the rule above.
**Changing the bank's structure** — adding a file, reorganising the taxonomy,
editing this document — is ordinary source work: do it in a worktree, on a
branch, and open a PR, exactly like any other code change.

**Pinning knowledge** — a lesson, a status refresh, a decision — goes through
the symlink into the main clone, and ships in a memory wrap PR. See
[`c_memory_protocol.md`](c_memory_protocol.md).

The difference is the question "is this a change to the container, or a write to
its contents?" Container: branch and PR. Contents: through the link.
