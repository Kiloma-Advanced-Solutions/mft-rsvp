# Events Board

An internal events board: organizers publish events, everyone else finds them
and registers. Events open up in one of three ways — freely, behind an approval
step, or by invitation only.

This repository is the **starting point for a Claude Code workshop**. The design
system, UI kit, data layer, session handling and API conventions are done. The
product is not.

- **The brief:** [`TASKS.md`](TASKS.md)
- **The house style:** [`CLAUDE.md`](CLAUDE.md)

## Getting started

**Node 22.18 or newer.** The floor is set by one thing: the database scripts are
TypeScript and Node runs them directly, which needs no flag only from 22.18.
(They also use `--env-file-if-exists`, which has a lower requirement of its own.)
`engines` in `package.json` records the minimum.

```bash
npm install
```

The app reads and writes a real database, so it needs a connection string and a
schema before it will serve a page — [The database](#the-database) has that
sequence. Then:

```bash
npm run dev
```

Then open <http://localhost:3000>. The start page explains what is built and what
is yours, and `/styleguide` renders every component in the kit with real data.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run check:tsql` | Hold the project's T-SQL to the SQL Server 2008 R2 feature floor |
| `npm run db:check` | Read-only preflight against the configured SQL Server target |
| `npm run db:migrate` | Apply pending schema migrations (`-- --dry-run`, `-- --status`) |
| `npm run db:seed` | Insert the development fixtures into an empty SQL schema (`-- --status`) |
| `npm run db:reset` | Clear this application's SQL data and re-seed it |

## How it fits together

```
app/
  page.tsx              Start here — what is built, what is yours
  events/               The board and the event detail screen  ← your work
  styleguide/           Every component, rendered
  api/session/          Persona switching, and the API house style to copy
  styles/tokens.css     Design tokens, light and dark
components/
  ui/                   Generic primitives
  events/               Event cards, badges, date blocks, capacity meters
  layout/               App shell, nav, persona switcher
lib/
  types.ts              The domain model
  db.ts                 The persistence boundary (server only)
  data/                 SQL: the statements, the pool, the CLIs
  seed.ts               12 events, 5 people, every state covered
  session.ts            Who the current user is
  api.ts                Route handler and fetch helpers
  labels.ts             User-facing copy
  date.ts               Date formatting and grouping
```

## There is no authentication

You "sign in" by picking a persona from the top right, which sets a cookie the
server reads on every request. Switching persona is how you verify the
visibility rules — an invite-only event should disappear entirely for someone
who was not invited.

## The database

Data lives in SQL Server and survives a dev-server restart. `lib/db.ts` is the
persistence boundary and the only thing product code imports: pages, route
handlers and `lib/events.ts` talk to `db` and know nothing about the driver.

```
Server Component / Route Handler → lib/db.ts → lib/data/* → mssql → SQL Server
```

There is one configuration variable, server-only:
`EVENTS_DB_CONNECTION_STRING`. Copy `.env.example` to `.env.local` and fill it
in; `.env.local` is git-ignored and is the only place a real connection string
ever lives.

### From a fresh checkout

```bash
npm install
cp .env.example .env.local       # then set EVENTS_DB_CONNECTION_STRING
npm run db:check                 # read-only: can we reach the target at all?
npm run db:migrate               # create this application's tables
npm run db:seed                  # 12 events, 5 people — into an empty schema
npm run dev
```

### Looking without touching

Every one of these is read-only:

```bash
npm run db:check                 # what the target says about itself
npm run db:migrate -- --dry-run  # what would run, without connecting
npm run db:migrate -- --status   # what is applied, what is pending
npm run db:seed -- --status      # row counts in our tables
```

Migrations are the numbered files in `migrations/`, applied once each, in order,
one transaction apiece, and recorded in `dbo.Events_SchemaMigrations`.

### Putting the fixtures back

```bash
EVENTS_DB_ALLOW_RESET=yes npm run db:reset
```

`db:seed` never deletes: if the tables already hold rows it says so and stops.
`db:reset` is the one that deletes, and it needs two separate conditions —
`NODE_ENV` must not be `production`, **and** `EVENTS_DB_ALLOW_RESET=yes`
supplied for that invocation. Both run in a single transaction, so a failure
leaves the database exactly as it was.

"For that invocation" is enforced, not asked for: reset reads `.env.local` and
**refuses if the variable is declared there at all**, because Node merges the
env file into the environment and a value parked in a file would pre-authorise
every future reset. `.env.local` remains where `EVENTS_DB_CONNECTION_STRING`
belongs — it is only this one variable that may not live there.

Reset is a command, and only a command. There is no HTTP endpoint that resets
anything: the opt-in above is stated at the moment of the reset, which is
precisely what a web request cannot do.

Stop the dev server first. Reset takes an exclusive lock on the events table
before it deletes anything, which removes the known deadlock cycle between a
reset and an application seat claim — it is not a proof that no deadlock is
possible. And it still empties every table the app is reading, so a request that
lands mid-reset either waits on the lock or sees a half-finished world.

### It is a shared database

The development database is an organizational one, full of tables that are not
ours, reached with an account that has far more permission than this project
needs. Every safeguard is therefore on our side:

- every object the application creates is prefixed `Events_`, and so is every
  table it writes to — `npm run check:tsql` enforces both;
- the migration runner creates and alters only those objects. It never creates,
  drops or alters a database;
- `db:reset` deletes from five tables named as constants in the source. There is
  no `LIKE 'Events_%'` sweep and no table name that is ever computed;
- no statement in the seed or reset tool changes `Events_SchemaMigrations` — it
  is read, and a reset checks it is unchanged afterwards, so migration history
  survives;
- unrelated tables are never read or written by any of this.

Read
[docs/sql-server-2008r2-compatibility.md](docs/sql-server-2008r2-compatibility.md)
before writing any SQL. The short version: application SQL is written to the
SQL Server 2008 R2 feature floor and statically enforced; runtime verification
has only been performed against Azure SQL DEV.
