# u_ — The machine, the tooling and the Claude Code setup

The environment this project is actually developed in, so that "works on my
machine" is a documented machine. Captured 2026-08-20.

---

## 1. Who

| | |
| --- | --- |
| Developer | Alona Rozner |
| Git identity | `Alona Rozner <alonarozner4@gmail.com>` |
| Claude Code account | `alona@kiloma.com` |
| Organisation | Kiloma Advanced Solutions |

Note the two different addresses: commits are authored with the Gmail address,
the Claude Code session is signed in with the Kiloma one. If GitHub ever shows
commits as unattributed, that mismatch is the first thing to check.

---

## 2. Machine and shells

| | |
| --- | --- |
| OS | Windows 11 Pro, build 10.0.26200 |
| Primary shell | PowerShell (Windows PowerShell 5.1) |
| Secondary shell | Git Bash (POSIX `sh`), available in the same session |
| Home directory | `C:\Users\למד` |
| Project root | `C:\projects\mft-rsvp` |

**Two things about this setup that bite:**

1. **The home directory contains Hebrew characters** (`C:\Users\למד`). Most
   tools cope, but anything that mangles non-ASCII paths will fail in a
   confusing way. If a tool cannot find a config under `~`, suspect this before
   suspecting the config.
2. **PowerShell 5.1 is not bash.** No `&&` or `||` chaining, no ternary, no
   `head`/`tail`/`which`/`touch`. Use `;` plus `if ($?) { … }`, or run the
   command through Git Bash. The `bash` blocks in this memory bank are written
   for Git Bash.

---

## 3. Toolchain

| Tool | Version |
| --- | --- |
| Node.js | v24.16.0 |
| npm | 11.13.0 |
| Git | 2.44.0.windows.1 |
| GitHub CLI (`gh`) | **not installed** — PRs are opened in the browser |

Git configuration that matters:

| Setting | Value | Consequence |
| --- | --- | --- |
| `core.autocrlf` | `true` | Checkout converts to CRLF, commit converts back to LF. The repo stays LF; do not "fix" line endings in a diff |
| `init.defaultBranch` | `master` | This repo's main branch is `master`, not `main` |
| `core.editor` | not set | Git falls back to its default. Avoid commands that open an editor — pass `-m` |

Remote: `origin` → <https://github.com/Kiloma-Advanced-Solutions/mft-rsvp.git>
(HTTPS, so pushes use the credential manager, not an SSH key).

---

## 4. Running the project

```bash
npm install
```

```bash
npm run dev
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on <http://localhost:3000> |
| `npm run build` | Production build |
| `npm run typecheck` | `next typegen && tsc --noEmit` — the typegen step matters, `PageProps` and `LayoutProps` are generated |
| `npm run lint` | ESLint |

Reset the fixtures without restarting:

```bash
curl -X POST http://localhost:3000/api/dev/reset
```

**`node_modules/` lives only in the main checkout** (`C:\projects\mft-rsvp`).
A git worktree under `.claude/worktrees/` does not get its own copy, so
`npm run …` and the bundled Next docs at `node_modules/next/dist/docs/` have to
be reached from the main checkout.

---

## 5. Claude Code configuration

### 5.1 Global — `C:\Users\למד\.claude\settings.json`

```json
{
  "skipWorkflowUsageWarning": true
}
```

Deliberately almost empty: nothing global is imposed on other projects. Also
under `~/.claude/`: `projects/` (per-project session state and memory),
`sessions/`, `shell-snapshots/`, `backups/`, `telemetry/`,
`remote-settings.json`, `policy-limits.json`. Those are managed by the tool,
not edited by hand.

### 5.2 Project — `.claude/settings.json` (committed)

An allowlist of commands Claude may run without asking. Read-only git, the
npm scripts, and localhost curl — nothing that can push, force, delete or
reach the network beyond `localhost:3000`.

```
Bash(npm run dev:*)   Bash(npm run build:*)   Bash(npm run lint:*)
Bash(npm run typecheck:*)   Bash(npm install:*)
Bash(npx tsc:*)   Bash(npx next:*)
Bash(git status:*)  Bash(git diff:*)   Bash(git log:*)    Bash(git show:*)
Bash(git add:*)     Bash(git commit:*) Bash(git branch:*)
Bash(git checkout:*)  Bash(git switch:*)
Bash(ls:*)  Bash(rg:*)  Bash(find:*)
Bash(curl http://localhost:3000/*)
Bash(curl -X POST http://localhost:3000/*)
Bash(curl -s http://localhost:3000/*)
```

Notably **absent, on purpose**: `git push`, `git reset`, `git rebase`, `rm`,
and any curl to a host other than localhost. Those still prompt.

### 5.3 Project — `.claude/launch.json` (committed)

```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "events-board",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000 }
  ]
}
```

Lets the in-app browser start the dev server itself. Start the preview by the
name `events-board` rather than running `npm run dev` in a terminal — that way
screenshots, console output and network requests are readable from the session.

### 5.4 Worktrees

Claude Code sessions run in git worktrees under
`C:\projects\mft-rsvp\.claude\worktrees\<name>`, each on its own branch. The
main checkout stays on whatever branch you left it on. Consequences:

- `node_modules/`, `.next/` and `next-env.d.ts` are not in the worktree.
- Two worktrees cannot have the same branch checked out. If `git checkout <b>`
  refuses, that branch is live in another worktree — `git worktree list` shows
  where.

### 5.5 The instruction files Claude reads

| File | Committed | Role |
| --- | --- | --- |
| `CLAUDE.md` | yes | The house style. Read on every turn — keep it short |
| `AGENTS.md` | yes | Written by `next dev`. Do not edit; commit it if it shows up dirty |
| `docs/*.md` | yes | This memory bank. Loaded on demand, not every turn |

---

## 6. Reproducing this setup on another machine

1. Node 24.x and npm 11.x. Git 2.44+.
2. `git clone https://github.com/Kiloma-Advanced-Solutions/mft-rsvp.git`
3. `npm install`
4. `git config user.name` / `user.email` to your own identity.
5. `npm run dev`, open <http://localhost:3000>, then `/styleguide`.
6. Read, in this order: `TASKS.md` → `CLAUDE.md` → `docs/README.md`.

Nothing else is required — no `.env`, no database, no external service. The
`.gitignore` covers `.env*` anyway, so if a secret ever does become necessary
it will not be committed by accident.
