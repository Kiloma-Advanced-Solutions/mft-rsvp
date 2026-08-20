# MEMORY.md — the index

The project's persistent, shared brain. Git-tracked, so it travels with the repo
to every session, every machine, every teammate.

**A session is not done when the code merges. It is done when the lesson is
pinned here.** That is the whole point of this directory.

---

## Before you write anything here — one check

The bank lives **once**, in the main clone, at `<main clone>/memory/`. Every
session reaches it through a symlink at
`~/.claude/projects/<mangled-main-clone-path>/memory/`.

A git worktree has its own checkout of `memory/`. **Editing that copy is not
editing the bank** — the write is orphaned and lost on cleanup. Before your
first memory write in a session:

```bash
./scripts/memory-bank.sh check
```

Matching inodes mean the link is real. If it fails, run
`./scripts/memory-bank.sh link` and re-check. The full explanation and the
recovery drill are in [`c_worktrees.md`](c_worktrees.md).

---

## If you want to know… go to

| Question | File |
| --- | --- |
| What is this product, and what state is it in? | [`a_overview.md`](a_overview.md) |
| How is the system put together? Where does permission logic go? | [`a_system.md`](a_system.md) |
| How do we write code here — style, tests, commits, PRs? | [`c_conventions.md`](c_conventions.md) |
| How do I open, run and close a session? How do I pin a lesson? | [`c_memory_protocol.md`](c_memory_protocol.md) |
| How do worktrees and the memory symlink work? What is the orphan-edit trap? | [`c_worktrees.md`](c_worktrees.md) |
| What does a word mean — host, going, access, persona? | [`d_glossary.md`](d_glossary.md) |
| Why did we decide X? What has bitten us before? | [`dec_log.md`](dec_log.md) |
| What is shipping, blocked or in flight right now? | [`s_status.md`](s_status.md) |
| What should I pick up next? | [`s_backlog.md`](s_backlog.md) |
| Where is the repo, the brief, the training deck? | [`r_references.md`](r_references.md) |
| What has already merged, and what did it teach us? | [`r_pr_history.md`](r_pr_history.md) |
| Who am I working with, and how do they like to work? | [`u_eyal.md`](u_eyal.md) |

Never guess which file holds an answer. Come back to this table.

---

## Reading order — a fresh session

Four steps, under a minute. Do not read the whole bank.

1. **[`s_status.md`](s_status.md)** — what is shipping, blocked or in flight right now.
2. **[`s_backlog.md`](s_backlog.md)** — what to pick up next, in order.
3. **[`u_eyal.md`](u_eyal.md)** + **[`c_conventions.md`](c_conventions.md)** — the operating constraints and the house rules.
4. **Drill down via the index above** — pull only the `a_` / `dec_` / `d_` docs the task actually needs.

`CLAUDE.md` at the repo root points here, so this order runs on every session
without anyone having to ask for it.

---

## The taxonomy

The prefix is a promise about **volatility**. It tells you how much to trust a
file's freshness, and where a new fact belongs.

| Prefix | Holds | Changes |
| --- | --- | --- |
| `a_` | **Architecture** — how the system is built | Rarely; only when the system does |
| `c_` | **Conventions** — how the team works | Occasionally, by decision |
| `d_` | **Domain** — terminology and reference | Slowly; the glossary is the anchor |
| `dec_` | **Decisions** — append-only log of choices, rationale, and pinned lessons | Grows every session |
| `s_` | **State** — what is in flight | Volatile; refreshed every wrap PR |
| `r_` | **References** — pointers to external truth | As the outside world moves |
| `u_` | **User** — an operator's profile, preferences, machine setup | Rarely |

One `u_<name>.md` per teammate. Add your own; do not edit someone else's.

---

## The four disciplines

These are what stop a system from rotting back into a pile of notes.

1. **One home per fact.** A new convention goes to `c_conventions.md`, a new
   decision to `dec_log.md`, a status change to `s_status.md`. Exactly one
   correct file, every time. If a fact seems to belong in two, it belongs in the
   more stable one, and the other links to it.
2. **Glossary first.** A new term goes into `d_glossary.md` first; every other
   doc then references it. One definition, never three drifting copies.
3. **Fold small files in.** A doc under ~50 lines folds into an existing file.
   New top-level files are created reluctantly — proliferation is the failure
   mode this taxonomy exists to prevent.
4. **Archive, don't delete.** Retired and session-specific docs move to
   [`archive/`](archive/) — preserved for history, never loaded by default. The
   active set stays lean enough to read in a minute.

Full working protocol, including the session open/close checklist and the
lesson template: [`c_memory_protocol.md`](c_memory_protocol.md).
