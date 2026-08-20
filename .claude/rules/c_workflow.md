---
description: How work moves in this repo — the two standing permission rules, plus branching and PR shape.
---

# Working agreement

## 1. Never commit, push, or open a PR without asking

Do not run `git add`, `git commit`, `git push`, `git tag`, or `gh pr create` on
your own initiative. Write the code, run the checks, show the diff — then ask,
and wait for a clear yes.

Approval of one commit is **not** approval of the next. Ask every time.

This holds even though `.claude/settings.json` allowlists `git add` and
`git commit` so they run without a permission prompt. The allowlist is a
convenience for when permission *has* been given; it is not the permission.

Why: every change is reviewed before it enters the history, and the workshop
says explicitly that the commit history will be read.

## 2. Never settle a decision alone

Where the brief is silent, where two approaches are both defensible, or where
reality turns out different from what was planned — stop and ask. Do not pick
the sensible default and carry on, and do not bury the choice in the code for
someone to find later.

Present the fork with its real trade-offs and a recommendation, then wait. Once
it is settled, write it down as a `dec_*` file so it does not get re-litigated.

Why: the design calls on this project are owned up front, not reviewed after
the fact.

## Branches

- Work on a branch, never on `master`. `master` is the default branch and the
  PR target.
- Workshop convention from `TASKS.md`: `<yourname>/events-board`. Agent-created
  worktree branches use `claude/<topic>-<hash>` and live under
  `.claude/worktrees/`.
- Commits are small and readable — each one a thing someone could review on its
  own.

## Pull requests

Keep it short; every one gets read. `TASKS.md` §8 has the template. Four
sections: what was built (which milestones, and the state of each), the two or
three decisions someone else would have made differently, an honest list of what
was not done, and the three clicks a reviewer should make — including which
personas to switch between.

"M5 not started" is a fine line to have in a PR. A PR that overclaims is not.
