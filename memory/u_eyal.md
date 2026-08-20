# u_eyal — operator profile

One file per teammate: `u_<name>.md`. **Add your own; do not edit someone
else's.** Keep it to what changes how a session should behave — this is not a
personnel record.

---

## Who

**Eyal** — Kiloma Advanced Solutions. Leads this project and is running the
*Claude Code for Teams* training programme it belongs to. Reads work as a team
lead would: the shape of the approach and the honesty of the report matter as
much as the diff.

## How to work with them

- **Show the plan before the code.** A wrong plan costs thirty seconds to fix;
  wrong code costs ten minutes. Applies to memory-bank changes as much as to
  features.
- **Slices you can verify.** Build one milestone, look at it in the browser,
  switch persona, *then* move on. When a prompt reaches its fourth "and also",
  it should have been two prompts.
- **Say what you did not do.** "M5 not started" is a fine line to have in a PR.
  An honest report beats a confident one — the brief says so explicitly, and it
  is how this project is graded.
- **This work is a teaching artefact.** The memory bank and the worktree setup
  are demonstrated to a team. Prefer the explicable choice over the clever one,
  and write down *why*, not just *what*.

## Machine setup

| | |
| --- | --- |
| Platform | macOS (Darwin 25.x), `zsh` |
| Main clone | `/Users/eyalbenjamin/WebDeveloper/mft-rsvp` |
| Worktrees | `<main clone>/.claude/worktrees/<name>` — git-ignored |
| Memory symlink | `~/.claude/projects/-Users-eyalbenjamin-WebDeveloper-mft-rsvp/memory` → `<main clone>/memory` |
| Package manager | **npm.** `package-lock.json` is committed; an untracked `pnpm-lock.yaml` exists in the main clone and should be ignored, not used. |
| Dev server | `npm run dev`, port 3000 |
| Git author | `EkingIsrael` |

## To fill in

Genuinely unknown rather than assumed — a memory bank that guesses is worse than
one with gaps. Add these as they come up:

- [ ] Preferred commit message style beyond "commit as you go".
- [ ] Whether PRs go through review before merge, and who reviews.
- [ ] Working hours / timezone, if it affects when things are expected.
- [ ] Which parts of the training series the team has already run.
