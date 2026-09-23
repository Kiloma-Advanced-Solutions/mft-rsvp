# Operator Environment

How to run, test and work on this project. Development-environment context, not a
personal profile — no personal information is stored here.

## Running the app

The dev server is launched from the `events-board` configuration in
[.claude/launch.json](../.claude/launch.json), which runs `npm run dev` on
**port 3000**. Use that configuration rather than starting a server by hand.
Installation and the plain-terminal equivalent are in [README.md](../README.md).

Starting the process is not the same as serving a page. The pool opens on first
use, so the dev server starts with no database at all. But every page sits
inside the app frame, `AppShell`, which resolves the current or default persona
from the database — so no framed page serves successfully until the connection
string is configured, the schema has been migrated and the fixtures have been
seeded. Seeding is not optional in practice: the application has no way to
create a user, and the default persona exists only because the fixtures supply
it. A framework error page rendering is not the app working. The sequence is in
[README.md](../README.md) "The database".

## The database

Data lives in SQL Server and survives a dev-server restart. It is a **shared
organizational database**, not a disposable local one.

- **Configuration** is one server-only variable, set in the untracked local env
  file. [.env.example](../.env.example) is authoritative for which variables
  exist and what they mean.
- **Setup, migrate, seed, reset and the read-only status checks** — the workflow
  and its commands are in [README.md](../README.md) "The database", which is
  authoritative. The fixtures — 12 events, 5 people, every state covered — are
  defined in [lib/seed.ts](../lib/seed.ts); seeding only ever fills an empty
  schema and never deletes.
- **Reset is a CLI command and only a command.** There is no HTTP endpoint that
  resets anything. It refuses in production, and it needs an explicit opt-in
  supplied **for that invocation** — which must never be parked in `.env.local`;
  reset inspects that file and refuses if the opt-in is declared there. Stop the
  dev server before resetting. Why it works this way: [dec_log.md](dec_log.md).
- **What we may and may not do to a shared database** — object naming, what
  destructive statements may target, migration history — is in
  [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md)
  "Shared-database safety rules".

## Migration operating contract

The migration runner applies each pending file in `migrations/` once, in order,
one transaction per migration, and records it in its own history table. What it
does **not** do is as important:

- **It is a single-operator command.** There is no cross-process migration lock,
  so overlapping runs are not supported — serialize them yourself.
- **Atomicity is per migration, and qualified.** For transactional DDL and DML —
  which is all a migration here contains — a migration's batches and its history row
  commit or roll back together. A commit whose acknowledgement never arrives is
  reported as unknown rather than as success or rollback. If two runs do
  overlap, the history table's primary key stops both from recording the same
  migration, so the expected cost is one failed run — not a guarantee against
  every failure mode.
- **A migration's identity is its file name.** Nothing records a checksum of an
  applied file's contents, so editing an applied migration goes undetected.
  Treating applied migrations as immutable is therefore a convention, not
  something the runner enforces: add a new migration instead.
- **After an interrupted or competing run, check the status report before
  deciding what to rerun** — a failure whose commit was never acknowledged is
  reported as unknown rather than guessed at.

The rules a migration must follow are in the runner's header,
[lib/data/migrate.mts](../lib/data/migrate.mts), and in the compatibility
document above.

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
in this repository — the everyday npm scripts (dev, build, lint, typecheck,
install), common git commands, and `localhost:3000` curls. Anything outside that
list prompts, and that includes the `check:*` and `db:*` scripts.

## Branch and worktree workflow

Development happens on a personal feature branch;
[TASKS.md](../TASKS.md) §2 states the `<yourname>/events-board` convention. Claude
Code sessions may work in isolated task branches, each in its own worktree under
`.claude/worktrees/`, based on the current development or task branch — so a
session's work stays separable until it is deliberately brought back.

Which branch is current is state, not configuration: see
[s_status.md](s_status.md).
