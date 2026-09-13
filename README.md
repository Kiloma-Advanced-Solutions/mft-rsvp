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

```bash
npm install
```

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
  api/dev/reset/        Reload the fixtures without restarting
  styles/tokens.css     Design tokens, light and dark
components/
  ui/                   Generic primitives
  events/               Event cards, badges, date blocks, capacity meters
  layout/               App shell, nav, persona switcher
lib/
  types.ts              The domain model
  db.ts                 In-memory store (server only)
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

## There is no database

Data lives in memory and resets when the dev server restarts. `lib/db.ts` is
async and shaped like a real repository, so replacing it later would be a change
of implementation rather than a change of every call site.

To reload the fixtures without restarting:

```bash
curl -X POST http://localhost:3000/api/dev/reset
```

### …but the schema is being built alongside it

M6 is replacing that in slices. The SQL tables now exist and can be created from
scratch, while `lib/db.ts` is still the in-memory store the whole application
reads and writes — so nothing above has changed, and restarting the dev server
still resets the data.

Configuration is one server-only variable, `EVENTS_DB_CONNECTION_STRING`. Copy
`.env.example` to `.env.local` and fill it in; `.env.local` is git-ignored and is
the only place a real connection string ever lives.

```bash
npm run db:check                 # read-only: can we reach the target at all?
npm run db:migrate -- --dry-run  # what would run, without connecting
npm run db:migrate -- --status   # what is applied, what is pending
npm run db:migrate               # apply pending migrations
```

Migrations are the numbered files in `migrations/`, applied once each, in order,
one transaction apiece, and recorded in `dbo.Events_SchemaMigrations`. Every
table the application creates is prefixed `Events_`, and so is every table it
writes to, which `npm run check:tsql` enforces — the development database is a
shared organizational one, so read
[docs/sql-server-2008r2-compatibility.md](docs/sql-server-2008r2-compatibility.md)
before writing any SQL.

Once the schema exists you can put the same fixtures the in-memory store uses
into it:

```bash
npm run db:seed                                  # only into an empty schema
npm run db:seed -- --status                      # row counts; changes nothing
EVENTS_DB_ALLOW_RESET=yes npm run db:reset       # clear our data, then re-seed
```

`db:seed` never deletes: if the tables already hold rows it says so and stops.
`db:reset` is the one that deletes, and it needs two separate conditions —
`NODE_ENV` must not be `production`, **and** `EVENTS_DB_ALLOW_RESET=yes` must be
supplied on the command line. It clears five hard-coded tables and no others;
migration history is never touched. Both run in a single transaction, so a
failure leaves the database exactly as it was.
