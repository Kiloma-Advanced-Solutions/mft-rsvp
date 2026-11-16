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

- **Configuration** is one server-only variable for the database, set in the
  untracked local env file; sharing and email have their own, below.
  [.env.example](../.env.example) is authoritative for which variables exist
  and what they mean.
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
  which is all a migration here contains today — a migration's batches and its history row
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

**Migration `0003` (C5)** adds one nullable column,
`dbo.Events_Events.DeletedAt datetime2(3) NULL`, with no default, index or
constraint. It changes no data: every existing event reads `NULL` and stays
live, and nothing is removed from any table. It was applied to the shared Azure
SQL DEV database on 2026-10-26, from the C5 branch and with explicit approval,
after a `sys.tables` snapshot before and after showed that only
`Events_Events` changed. Because the database is shared, a dev server running
code from before C5 still sees soft-deleted events as live — see
[s_status.md](s_status.md) "Known limitations".

**Migration `0004` (M12)** creates `dbo.Events_AuditLog`: 17 columns, a
nonclustered primary key on `Id`, `UNIQUE(RequestId)`, three CHECK constraints
(`Channel`, `SubjectType`, `Outcome`), a clustered index on `OccurredAt` and
three nonclustered indexes -- no defaults, foreign keys or triggers. It was
applied to the shared Azure SQL DEV database on 2026-11-15 at 14:36:18 UTC,
from the M12 branch at `1b297e2`, with explicit approval and after the other
developers were notified, by running `node --env-file=<main checkout>/.env.local
lib/data/migrate.mts` once (exit 0, 5 batches, about one second): four
migrations applied, none pending, the new table empty and the existing
`Events_*` tables unchanged. The before-and-after checks and the first real
audit write are in [dec_log.md](dec_log.md) (2026-11-15, D11). The audit
table now holds test rows from M12's DEV sessions, and DEV keeps two
soft-deleted `[M12 test]` events, one of them with two registrations; the time
windows are in [dec_log.md](dec_log.md) (2026-11-16). The same database holds
another application's `dbo.AuditLogs` (plural), which is unrelated. Run the runner with `node` directly: `npm run db:migrate
--status` without the `--` lets npm swallow the flag and **applies**
migrations instead.

`npm run db:check` reports the target's isolation flavour. On Azure SQL DEV it
reports `READ_COMMITTED_SNAPSHOT` on; C5 additionally observed that optimized
locking is on there (`DATABASEPROPERTYEX(DB_NAME(), 'IsOptimizedLockingOn')`),
which `db:check` does not report. Concurrency results from DEV are evidence about
that engine only; nothing has been run against a real SQL Server 2008 R2.

**Capacity of DEV** (read-only catalog queries, 2026-11-15, M12 S4). The
database is Azure SQL **Basic** (service objective `Basic`, not in an elastic
pool): a 2 GB size limit and a small, shared compute allowance (5 DTU). On that
day the data file was 64 MB allocated with about 41 MB used, the log file 72 MB
with about 3% used (5 GB limit, FULL recovery with Azure's own log backups),
and accelerated database recovery was on, so row versions live in the database
itself. The `Events_*` tables took under 1 MB. The database is shared with
other applications' tables. Measured load was close to idle (CPU peak about
1% over the previous hour). For anything that sends many requests -- a race
test, a benchmark -- the compute allowance, not storage, is the limit: the
application's pool opens at most 10 connections, and a Basic database also
caps concurrent workers. Watch `sys.dm_db_resource_stats` while such a test
runs.

## Sharing and email

- **Configuration.** [.env.example](../.env.example) is authoritative for the
  variables, what each means and their format. Locally, set
  `EVENTS_APP_BASE_URL` to the dev server's origin, or the Share menu reports
  sharing as unavailable. The mail variables are left unset locally on purpose:
  their real values belong to the organization's mail service, and unset, every
  send is refused as "not configured" before any request is made.
- **Previewing an email.** `npm run email:preview` starts the React Email
  preview server on **port 3002**, separate from the dev server, and shows the
  templates in [emails/](../emails/) with their built-in sample data. It needs no
  database and no mail configuration.
- **Email images** are `data:` URI modules in `emails/images/`, generated with
  [scripts/base64convertor.mts](../scripts/base64convertor.mts), which has no
  npm script; its header gives the usage.

Seeing the email in the preview is not seeing it in Outlook, and delivery
through the organization's real mail service has not been verified — see
[s_status.md](s_status.md) "Known limitations".

## Persona-based development

There is no authentication, and that is deliberate: the exercise is about
authorisation, not login screens. You "sign in" by picking a persona from the
switcher at the top of the navigation rail — the avatar in the top bar on a
narrow screen — which writes the `eb_persona` cookie that the server
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
list prompts, and that includes the `check:*` and `db:*` scripts and
`email:preview`. [.claude/launch.json](../.claude/launch.json) has no
configuration for the email preview server.

## Branch and worktree workflow

Development happens on a personal feature branch;
[TASKS.md](../TASKS.md) §2 states the `<yourname>/events-board` convention. Claude
Code sessions may work in isolated task branches, each in its own worktree under
`.claude/worktrees/`, based on the current development or task branch — so a
session's work stays separable until it is deliberately brought back.

Which branch is current is state, not configuration: see
[s_status.md](s_status.md).
