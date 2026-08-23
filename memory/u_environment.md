# Operator Environment

How to run, test and work on this project. Development-environment context, not a
personal profile — no personal information is stored here.

## Running the app

The dev server is launched from the `events-board` configuration in
[.claude/launch.json](../.claude/launch.json), which runs `npm run dev` on
**port 3000**. Use that configuration rather than starting a server by hand.
Installation and the plain-terminal equivalent are in [README.md](../README.md).

## Data lifetime and reset

Data lives in memory and is thrown away when the dev server restarts. To restore
the fixtures without restarting, POST to `/api/dev/reset` — see
[app/api/dev/reset/route.ts](../app/api/dev/reset/route.ts), which refuses to run
in a production build. The fixtures themselves — 12 events, 5 people, every state
covered — are in [lib/seed.ts](../lib/seed.ts).

## Persona-based development

There is no authentication, and that is deliberate: the exercise is about
authorisation, not login screens. You "sign in" by picking a persona from the
switcher in the top right, which writes the `eb_persona` cookie that the server
reads on every request. `getCurrentUser()` in
[lib/session.ts](../lib/session.ts) resolves it, falls back to a default persona
when the cookie is missing, and never returns null.

**Why this matters for every task:** switching persona is how visibility and
permission rules get verified. An invite-only event must vanish entirely for
someone who was not invited — not be hidden in the browser, but be absent from
the page and from the API response. No amount of typechecking catches that; only
switching does. This is why [TASKS.md](../TASKS.md) §7 asks you to click through
as more than one persona before claiming done.

The five seeded personas and what each is useful for testing are tabulated in
[TASKS.md](../TASKS.md) §3, with the records in [lib/seed.ts](../lib/seed.ts).
Between them they cover an organizer hosting, an organizer looking at someone
else's event, a plain member, a member with a rejected request, and an admin
managing an event they do not host.

## Claude Code configuration

[.claude/settings.json](../.claude/settings.json) lists the commands pre-approved
in this repository — the npm scripts, common read-only git commands, and
`localhost:3000` curls. Anything outside that list prompts.

## Branch and worktree workflow

Development happens on a personal feature branch;
[TASKS.md](../TASKS.md) §2 states the `<yourname>/events-board` convention. Claude
Code sessions may work in isolated `claude/*` branches, each in its own worktree
under `.claude/worktrees/`, based on the development branch — so a session's work
stays separable until it is deliberately brought back.

Which branch is current is state, not configuration: see
[s_status.md](s_status.md).
