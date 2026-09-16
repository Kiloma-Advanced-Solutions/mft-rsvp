/**
 * Development fixtures for the SQL database. A CLI, not part of the application.
 *
 *   npm run db:seed     # insert the fixtures into an empty application schema
 *   npm run db:reset    # clear this application's domain data, then re-seed
 *   npm run db:seed -- --status    # read-only: what is in our tables right now
 *
 * It lives under `lib/data/` for the same reason `migrate.mts` does: that
 * directory is a scan root of `npm run check:tsql`, so every statement written
 * here is held to the SQL Server 2008 R2 feature floor *and* to the ownership
 * rules that keep this project's writes inside its own tables.
 *
 * The application does not use any of this. It reads and writes SQL through
 * `lib/db.ts`, which has no reset and is not meant to grow one -- product
 * persistence and database administration are different jobs. Nothing in `app/`,
 * `components/` or `lib/*.ts` imports this module, which `npm run lint` now
 * enforces (see `eslint.config.mjs`), so no request -- starting the server,
 * loading the board, viewing an event, registering, approving -- can reach the
 * code below. There is no HTTP route that resets anything either; the opt-in
 * below is stated at the moment of the reset, which is exactly what a web
 * request cannot do. A reset happens because somebody typed the command and
 * supplied the opt-in, or it does not happen.
 *
 * THE SHARED DATABASE. This runs against an organizational database full of
 * tables that are not ours, with an account that holds `db_owner`. Every
 * safeguard is therefore application-side:
 *
 *   - the five tables a reset clears are written out as string constants. There
 *     is no `LIKE 'Events_%'` sweep, no catalog lookup, and no table name that
 *     is ever computed -- a dynamic name would also trip this project's own
 *     `check:tsql` ownership rule, which is the point of having it;
 *   - `Events_SchemaMigrations` is not one of them, and no statement here
 *     changes it. It is read -- the row counts report it, and a reset checks it
 *     is the same afterwards -- but never written, because wiping it would make
 *     the schema state unknowable;
 *   - nothing here issues DDL. It cannot create, alter or drop anything;
 *   - reset needs two independent guards, and neither is the connection string.
 *
 * Written to the SQL Server 2008 R2 feature floor and statically enforced;
 * runtime execution has been verified against Azure SQL DEV only.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import sql from "mssql";
import type { ConnectionPool, Transaction } from "mssql";

/**
 * Duplicated from `lib/data/client.ts` rather than imported, because that
 * module is `server-only` and a bare-Node process cannot resolve it.
 */
const CONNECTION_STRING_VAR = "EVENTS_DB_CONNECTION_STRING";

/**
 * The second of the two guards a reset needs, and the one that has to be
 * supplied deliberately.
 *
 * Presence is not enough: the value must be exactly `yes`. Someone who sets
 * `EVENTS_DB_ALLOW_RESET=false` is trying to turn this *off*, and a
 * presence-only check would read that as permission.
 *
 * It belongs on the command line, and **not** in `.env.local`: a value parked
 * in the env file would pre-authorise every future reset and turn the guard
 * into a one-time setup step. That is not left to discipline -- reset reads the
 * env file and refuses outright if the variable is declared there, because Node
 * merges it into `process.env` and keeps no record of where it came from.
 */
const RESET_OPT_IN_VAR = "EVENTS_DB_ALLOW_RESET";
const RESET_OPT_IN_VALUE = "yes";

/**
 * The env file the npm scripts load, named the same way they name it.
 *
 * `--env-file-if-exists=.env.local` resolves against the working directory, and
 * npm runs scripts from the package root, so this resolves to the same file
 * Node read.
 */
const ENV_FILE = ".env.local";

/**
 * Does the env file declare the reset opt-in?
 *
 * Presence is the whole question, so this deliberately does not parse values:
 * an uncommented assignment to the variable, in any form, is refused. Being
 * stricter than a real `.env` parser is the right direction here -- the answer
 * to "is this ambiguous?" should be "then do not put it in the file".
 *
 * A missing or unreadable file is not an error. It means the opt-in is not
 * parked there, which is exactly the state this wants.
 */
function envFileDeclaresOptIn(): boolean {
  let contents: string;
  try {
    contents = readFileSync(resolve(process.cwd(), ENV_FILE), "utf8");
  } catch {
    return false;
  }

  return contents.split(/\r?\n/).some((line) => {
    const text = line.trim();
    if (text === "" || text.startsWith("#")) return false;
    return new RegExp(`^(?:export\\s+)?${RESET_OPT_IN_VAR}\\s*=`).test(text);
  });
}

/* -------------------------------------------------------------- the tables */

/**
 * Everything this tool may touch, and the order a reset must delete in.
 *
 * Child before parent, because every foreign key in `migrations/0001` is
 * `ON DELETE NO ACTION` -- deliberately, so that a forgotten cleanup fails
 * loudly instead of silently cascading. Registrations, co-hosts and invites all
 * point at both events and users; events point at users.
 *
 * `Events_SchemaMigrations` is absent on purpose and must stay absent.
 */
const DOMAIN_TABLES = [
  "Events_Registrations",
  "Events_EventCoHosts",
  "Events_EventInvites",
  "Events_Events",
  "Events_Users",
] as const;

/**
 * One `DELETE` per table, each naming its table as a literal.
 *
 * Written out rather than generated from the list above. A generated
 * `DELETE FROM dbo.${table}` would read identically to a human and would be
 * exactly the dynamically-targeted destructive SQL the shared-database rules
 * forbid -- and `check:tsql` would reject it, because it could no longer see
 * which table was being emptied.
 *
 * The order here is `DOMAIN_TABLES`, and `assertAllowlistMatchesStatements()`
 * below proves it -- run before any destructive work, so the two lists cannot
 * drift into disagreeing about what a reset clears.
 */
const DELETE_STATEMENTS = [
  `DELETE FROM dbo.Events_Registrations;`,
  `DELETE FROM dbo.Events_EventCoHosts;`,
  `DELETE FROM dbo.Events_EventInvites;`,
  `DELETE FROM dbo.Events_Events;`,
  `DELETE FROM dbo.Events_Users;`,
] as const;

/**
 * The event-side lock a reset takes before it deletes anything.
 *
 * `TABLOCKX` because a reset clears every event, so there is no single row to
 * lock; `HOLDLOCK` so it is held to the end of the transaction rather than the
 * end of the statement, which is the whole point -- a lock released early would
 * let a seat claim slip in between this and the deletes and restore the cycle.
 *
 * Both hints predate SQL Server 2008 R2. The isolation level is untouched.
 */
const LOCK_EVENTS_TABLE = `
SELECT COUNT(*) AS Locked
FROM   dbo.Events_Events WITH (TABLOCKX, HOLDLOCK);
`;

/**
 * Proves the destructive statements are exactly the allowlist, in order.
 *
 * Two lists describing one thing will drift eventually, and the failure is
 * quiet: `DOMAIN_TABLES` is what the operator is *shown* as the scope of a
 * reset, while `DELETE_STATEMENTS` is what actually runs. A drift would make
 * the printed scope a lie about a destructive operation on a shared database.
 *
 * The regex is deliberately strict -- `DELETE FROM dbo.<Table>;` and nothing
 * else -- so a statement that grew a `WHERE`, a second table or an interpolated
 * name fails here rather than executing.
 *
 * Called from `main()` before any command runs, so `db:seed` and `--status`
 * check it too: a drift is a programming error and there is no reading of it
 * under which the tool should carry on.
 */
function assertAllowlistMatchesStatements(): void {
  const targets = DELETE_STATEMENTS.map((statement) => {
    const match = /^DELETE FROM dbo\.([A-Za-z0-9_]+);$/.exec(statement.trim());
    return match === null ? null : match[1];
  });

  const agrees =
    targets.length === DOMAIN_TABLES.length &&
    targets.every((target, index) => target === DOMAIN_TABLES[index]);

  if (!agrees) {
    throw new SeedError(
      `The reset allowlist and the reset statements disagree.\n\n` +
        `  allowlist:  ${DOMAIN_TABLES.join(", ")}\n` +
        `  statements: ${targets.map((t) => t ?? "<unrecognised>").join(", ")}\n\n` +
        `  These two lists describe the same thing and one of them has moved. ` +
        `Nothing was\n  run. Fix lib/data/seed.mts before using this tool ` +
        `again.`,
      2,
    );
  }
}

const INSERT_USER = `
INSERT INTO dbo.Events_Users
    (Id, Name, Email, Title, Role, Initials, Accent)
VALUES
    (@id, @name, @email, @title, @role, @initials, @accent);
`;

const INSERT_EVENT = `
INSERT INTO dbo.Events_Events
    (Id, Title, Summary, Description, StartsAt, EndsAt, LocationKind,
     LocationVenue, LocationAddress, LocationUrl, LocationPlatform,
     Category, Accent, Capacity, Access, Status, OrganizerId,
     CreatedAt, UpdatedAt)
VALUES
    (@id, @title, @summary, @description, @startsAt, @endsAt, @locationKind,
     @locationVenue, @locationAddress, @locationUrl, @locationPlatform,
     @category, @accent, @capacity, @access, @status, @organizerId,
     @createdAt, @updatedAt);
`;

const INSERT_REGISTRATION = `
INSERT INTO dbo.Events_Registrations
    (Id, EventId, UserId, Status, Message, CreatedAt, UpdatedAt,
     DecidedBy, DecidedAt)
VALUES
    (@id, @eventId, @userId, @status, @message, @createdAt, @updatedAt,
     @decidedBy, @decidedAt);
`;

const INSERT_COHOST = `
INSERT INTO dbo.Events_EventCoHosts (EventId, UserId)
VALUES (@eventId, @userId);
`;

const INSERT_INVITE = `
INSERT INTO dbo.Events_EventInvites (EventId, UserId)
VALUES (@eventId, @userId);
`;

/**
 * Does our schema exist yet? Read-only, and it names only our own tables.
 *
 * Asked before anything else so that running this before `db:migrate` produces
 * a sentence rather than a driver error about an invalid object name.
 */
const TABLES_EXIST = `
SELECT
    OBJECT_ID(N'dbo.Events_Users', N'U')            AS Users,
    OBJECT_ID(N'dbo.Events_Events', N'U')           AS Events,
    OBJECT_ID(N'dbo.Events_Registrations', N'U')    AS Registrations,
    OBJECT_ID(N'dbo.Events_EventCoHosts', N'U')     AS CoHosts,
    OBJECT_ID(N'dbo.Events_EventInvites', N'U')     AS Invites,
    OBJECT_ID(N'dbo.Events_SchemaMigrations', N'U') AS Migrations;
`;

/**
 * What is in our tables. One round trip, and the migration count rides along so
 * every report can show that the history is still intact.
 */
const COUNT_ROWS = `
SELECT
    (SELECT COUNT(*) FROM dbo.Events_Users)            AS Users,
    (SELECT COUNT(*) FROM dbo.Events_Events)           AS Events,
    (SELECT COUNT(*) FROM dbo.Events_Registrations)    AS Registrations,
    (SELECT COUNT(*) FROM dbo.Events_EventCoHosts)     AS CoHosts,
    (SELECT COUNT(*) FROM dbo.Events_EventInvites)     AS Invites,
    (SELECT COUNT(*) FROM dbo.Events_SchemaMigrations) AS Migrations;
`;

/* ------------------------------------------------------------------- errors */

/** Something the operator can fix. Reported as a message, never a stack. */
class SeedError extends Error {
  readonly exitCode: number;

  /** 2 for configuration or authorisation, 1 for a refusal or a failure. */
  constructor(message: string, exitCode: 1 | 2) {
    super(message);
    this.name = "SeedError";
    this.exitCode = exitCode;
  }
}

/** Builds a masker from the connection string without revealing it. */
function createRedactor(connectionString: string): (text: string) => string {
  const secrets = new Set<string>([connectionString]);

  for (const pair of connectionString.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;

    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (value === "") continue;

    if (/password|pwd|token|secret|key/i.test(key)) secrets.add(value);

    if (/^(server|data source|addr|address|network address)$/i.test(key)) {
      secrets.add(value);
      const [host] = value.split(",");
      if (host !== undefined && host.trim() !== "") secrets.add(host.trim());
    }
  }

  const ordered = [...secrets].sort((a, b) => b.length - a.length);

  return (text) => {
    let safe = text;
    for (const secret of ordered) safe = safe.split(secret).join("***");
    return safe;
  };
}

/** Whatever the driver threw, reduced to fields that are safe to show. */
function describeError(error: unknown, redact: (text: string) => string): string {
  if (!(error instanceof Error)) return redact(String(error));

  const parts = [`${error.name}: ${redact(error.message)}`];

  const code = (error as { code?: unknown }).code;
  if (typeof code === "string") parts.push(`code=${code}`);

  const original = (error as { originalError?: unknown }).originalError;
  if (original instanceof Error) parts.push(`cause: ${redact(original.message)}`);

  return parts.join(" | ");
}

/* ----------------------------------------------------------------- fixtures */

/**
 * The fixture types, taken from `lib/seed.ts` itself.
 *
 * `typeof import(...)` is a type-level query: it is erased entirely, so nothing
 * here resolves a module at runtime. Deriving the types this way rather than
 * importing them from `lib/types.ts` keeps the whole of this file's knowledge of
 * the fixtures flowing through one place.
 */
type SeedModule = typeof import("../seed");
type User = SeedModule["SEED_USERS"][number];
type EventRecord = ReturnType<SeedModule["createSeedEvents"]>[number];
type Registration = ReturnType<SeedModule["createSeedRegistrations"]>[number];

/** An `(EventId, UserId)` pair, which is all either junction table holds. */
type Membership = { eventId: string; userId: string };

type Fixtures = {
  users: User[];
  events: EventRecord[];
  registrations: Registration[];
  coHosts: Membership[];
  invites: Membership[];
};

/**
 * The application's own fixtures, flattened for SQL.
 *
 * `lib/seed.ts` is the single definition of this data and stays that way: there
 * is no second copy here, so the board a developer sees and the rows in the
 * database cannot describe different events.
 *
 * The import is dynamic and its specifier is computed, which is what lets this
 * work with no change to `tsconfig.json`. Node needs the real `.ts` extension to
 * resolve the file; TypeScript refuses a written `.ts` extension unless
 * `allowImportingTsExtensions` is on. Building the URL at runtime hides the
 * extension from TypeScript, and the cast hands the types straight back -- so
 * this is still fully type-checked, not an `any`.
 *
 * Note that the fixtures' timestamps are computed relative to now, by design:
 * `lib/seed.ts` spreads events across past, present and future so the board is
 * worth looking at whenever it is built. Ids are fixed; timestamps are not, so
 * a reset deliberately produces a fresh spread rather than restoring the
 * timestamps a previous seed happened to write.
 */
async function loadFixtures(): Promise<Fixtures> {
  const seed = (await import(
    new URL("../seed.ts", import.meta.url).href
  )) as SeedModule;

  const events = seed.createSeedEvents();

  return {
    users: seed.SEED_USERS,
    events,
    registrations: seed.createSeedRegistrations(),
    // `coHostIds` and `invitedUserIds` are arrays on the event; the schema has
    // no array type and the floor has no way to split one, so each element
    // becomes a row. Order is not preserved because nothing depends on it.
    coHosts: events.flatMap((event) =>
      event.coHostIds.map((userId) => ({ eventId: event.id, userId })),
    ),
    invites: events.flatMap((event) =>
      event.invitedUserIds.map((userId) => ({ eventId: event.id, userId })),
    ),
  };
}

/* ------------------------------------------------------------------ binding */

/**
 * An optional field, as SQL sees it.
 *
 * The domain model marks absent values by leaving the property off -- see
 * `parseLocation()` in `lib/eventInput.ts`, which deletes the fields a location
 * kind does not use, and the registration write path, which clears `message`,
 * `decidedBy` and `decidedAt` to `undefined` when a withdrawn row is revived.
 * `undefined` is converted here rather than left to the driver, so what reaches
 * the column is an explicit SQL NULL and not whichever behaviour `mssql`
 * happens to have.
 */
function orNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

/** An ISO timestamp as a bound `datetime2(3)`, or NULL when there is none. */
function orNullDate(value: string | undefined): Date | null {
  return value === undefined ? null : new Date(value);
}

type Counts = {
  Users: number;
  Events: number;
  Registrations: number;
  CoHosts: number;
  Invites: number;
  Migrations: number;
};

/** The five domain tables, in the order a report should list them. */
const COUNT_KEYS = [
  "Users",
  "Events",
  "Registrations",
  "CoHosts",
  "Invites",
] as const;

async function readCounts(runner: ConnectionPool | Transaction): Promise<Counts> {
  const result = await runner.request().query<Counts>(COUNT_ROWS);
  return result.recordset[0];
}

/**
 * Writes every fixture row. The one and only insert path.
 *
 * `db:seed` and `db:reset` both come through here, so a reset cannot produce
 * different data from a fresh seed -- which is the failure a second
 * implementation would eventually cause.
 *
 * Users first, then events, then everything that points at both. That order is
 * the foreign keys read forwards.
 *
 * One statement per row: 48 round trips inside a single transaction, which is
 * about a second against Azure SQL. A multi-row `VALUES` constructor is at the
 * floor and would be fewer trips, but it makes the parameter names positional
 * and buys nothing at this size.
 */
async function insertFixtures(
  transaction: Transaction,
  fixtures: Fixtures,
): Promise<void> {
  for (const user of fixtures.users) {
    await transaction
      .request()
      .input("id", sql.UniqueIdentifier, user.id)
      .input("name", sql.NVarChar(200), user.name)
      .input("email", sql.NVarChar(320), user.email)
      .input("title", sql.NVarChar(200), user.title)
      .input("role", sql.NVarChar(16), user.role)
      .input("initials", sql.NVarChar(8), user.initials)
      .input("accent", sql.NVarChar(16), user.accent)
      .query(INSERT_USER);
  }

  for (const event of fixtures.events) {
    await transaction
      .request()
      .input("id", sql.UniqueIdentifier, event.id)
      .input("title", sql.NVarChar(sql.MAX), event.title)
      .input("summary", sql.NVarChar(sql.MAX), event.summary)
      .input("description", sql.NVarChar(sql.MAX), event.description)
      .input("startsAt", sql.DateTime2(3), new Date(event.startsAt))
      .input("endsAt", sql.DateTime2(3), new Date(event.endsAt))
      .input("locationKind", sql.NVarChar(16), event.location.kind)
      .input("locationVenue", sql.NVarChar(sql.MAX), orNull(event.location.venue))
      .input("locationAddress", sql.NVarChar(sql.MAX), orNull(event.location.address))
      .input("locationUrl", sql.NVarChar(sql.MAX), orNull(event.location.url))
      .input("locationPlatform", sql.NVarChar(sql.MAX), orNull(event.location.platform))
      .input("category", sql.NVarChar(16), event.category)
      .input("accent", sql.NVarChar(16), event.accent)
      // Already `number | null` in the domain: null *is* "unlimited", not a
      // missing value, so it is passed through rather than defaulted.
      .input("capacity", sql.Int, event.capacity)
      .input("access", sql.NVarChar(16), event.access)
      .input("status", sql.NVarChar(16), event.status)
      .input("organizerId", sql.UniqueIdentifier, event.organizerId)
      .input("createdAt", sql.DateTime2(3), new Date(event.createdAt))
      .input("updatedAt", sql.DateTime2(3), new Date(event.updatedAt))
      .query(INSERT_EVENT);
  }

  for (const registration of fixtures.registrations) {
    await transaction
      .request()
      .input("id", sql.UniqueIdentifier, registration.id)
      .input("eventId", sql.UniqueIdentifier, registration.eventId)
      .input("userId", sql.UniqueIdentifier, registration.userId)
      .input("status", sql.NVarChar(16), registration.status)
      .input("message", sql.NVarChar(sql.MAX), orNull(registration.message))
      .input("createdAt", sql.DateTime2(3), new Date(registration.createdAt))
      .input("updatedAt", sql.DateTime2(3), new Date(registration.updatedAt))
      .input("decidedBy", sql.UniqueIdentifier, orNull(registration.decidedBy))
      .input("decidedAt", sql.DateTime2(3), orNullDate(registration.decidedAt))
      .query(INSERT_REGISTRATION);
  }

  for (const coHost of fixtures.coHosts) {
    await transaction
      .request()
      .input("eventId", sql.UniqueIdentifier, coHost.eventId)
      .input("userId", sql.UniqueIdentifier, coHost.userId)
      .query(INSERT_COHOST);
  }

  for (const invite of fixtures.invites) {
    await transaction
      .request()
      .input("eventId", sql.UniqueIdentifier, invite.eventId)
      .input("userId", sql.UniqueIdentifier, invite.userId)
      .query(INSERT_INVITE);
  }
}

/* -------------------------------------------------------------- transaction */

/**
 * Runs `work` in a transaction, all of it or none of it.
 *
 * The same defensive shape as `migrate.mts`: the server can abort a transaction
 * on its own, after which rolling back again throws, and the `rollback` event is
 * how we know that happened.
 */
async function inTransaction<T>(
  pool: ConnectionPool,
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const transaction = new sql.Transaction(pool);

  let abortedByServer = false;
  transaction.on("rollback", () => {
    abortedByServer = true;
  });

  await transaction.begin();

  try {
    const result = await work(transaction);
    // From here until `commit()` resolves, the outcome is genuinely unknown: a
    // connection lost after the server commits and before the acknowledgement
    // arrives looks exactly like a commit that never happened.
    phase = "committing";
    await transaction.commit();
    return result;
  } catch (error) {
    // Only the pre-commit failure can be rolled back to a known state. A commit
    // that threw is already past that, and rolling back on top of it would tell
    // us nothing -- so the phase is left saying so.
    if (phase === "in-transaction") {
      if (abortedByServer) {
        phase = "rolled-back";
      } else {
        try {
          await transaction.rollback();
          phase = "rolled-back";
        } catch {
          // Left as `in-transaction`: the rollback was attempted and its
          // outcome is unknown, which is not the same as rolled back.
        }
      }
    }
    throw error;
  }
}

/* ------------------------------------------------------------------- guards */

/**
 * Neither command may run against a production database. Seeding one with
 * demonstration data is as unwelcome as clearing it.
 */
function refuseInProduction(command: string): void {
  if (process.env.NODE_ENV === "production") {
    throw new SeedError(
      `${command} refuses to run with NODE_ENV=production.\n` +
        `  These fixtures are development data and this tool has no business ` +
        `pointing at a production database.`,
      2,
    );
  }
}

/**
 * The second guard, required only by reset because only reset destroys
 * anything. Being able to connect is not permission to empty the tables.
 *
 * The value is never echoed back -- saying what was found invites pasting a
 * connection-adjacent value into a terminal, and the operator knows what they
 * set.
 */
function requireResetOptIn(): void {
  // The opt-in must be stated for *this* invocation, so a value parked in the
  // env file is refused before the value itself is even considered. Node loads
  // `.env.local` into `process.env` and keeps no record of where a variable
  // came from, so the file is the thing that has to be asked.
  if (envFileDeclaresOptIn()) {
    throw new SeedError(
      `${RESET_OPT_IN_VAR} is set in ${ENV_FILE}, and reset will not accept ` +
        `that.\n\n` +
        `  The opt-in has to mean "empty the database now", which a value ` +
        `sitting in a file\n  cannot: it would pre-authorise every future ` +
        `reset, including the ones nobody\n  meant to run. Remove the line ` +
        `(or comment it out) and state the intent on the\n  command line ` +
        `instead:\n\n` +
        `      ${RESET_OPT_IN_VAR}=${RESET_OPT_IN_VALUE} npm run db:reset\n\n` +
        `  ${ENV_FILE} is still where ${CONNECTION_STRING_VAR} belongs. It is ` +
        `only this one\n  variable that may not live there.`,
      2,
    );
  }

  const value = process.env[RESET_OPT_IN_VAR];
  if (value === undefined || value.trim() !== RESET_OPT_IN_VALUE) {
    throw new SeedError(
      `db:reset needs ${RESET_OPT_IN_VAR}=${RESET_OPT_IN_VALUE}.\n\n` +
        `  Reset deletes every row this application owns. Being able to reach ` +
        `the database\n  is not authorisation to empty it, so the intent has to ` +
        `be stated:\n\n` +
        `      ${RESET_OPT_IN_VAR}=${RESET_OPT_IN_VALUE} npm run db:reset\n\n` +
        `  Supply it on the command line. It may not be set in ${ENV_FILE}: a ` +
        `value parked\n  there would pre-authorise every future reset, which ` +
        `is the opposite of what this\n  guard is for, and is refused ` +
        `separately.`,
      2,
    );
  }
}

/** Our schema has to exist before either command has anything to do. */
async function requireSchema(pool: ConnectionPool): Promise<void> {
  const result = await pool
    .request()
    .query<Record<string, number | null>>(TABLES_EXIST);
  const row = result.recordset[0];

  const missing = Object.entries(row)
    .filter(([, objectId]) => objectId == null)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new SeedError(
      `The application schema is not present (missing: ${missing.join(", ")}).\n` +
        `  Run \`npm run db:migrate\` first.`,
      2,
    );
  }
}

/* ----------------------------------------------------------------- commands */

/**
 * How far the process got, so a failure can say what is actually known -- and
 * only what is actually known.
 *
 * Without this the one catch in `main` asserted "Rolled back; the database is
 * as it was." for every failure, including one thrown *after* a transaction had
 * committed. Reading the row counts back is what made that reachable: it runs
 * after the commit, and a dropped connection there would have reported 48
 * inserted rows as nothing.
 *
 * Two of these five states are uncertainty, and they exist because the
 * uncertainty is real:
 *
 *   - `committing` -- the commit was sent and the answer never arrived. The
 *     server may have committed it; the client cannot tell. Claiming either
 *     outcome here would be a guess dressed as a fact.
 *   - `in-transaction` -- the work failed and the rollback could not be
 *     confirmed. A rollback that was *attempted* is not a rollback that
 *     *happened*, and only the confirmed case earns `rolled-back`.
 */
type Phase =
  | "read-only"
  | "in-transaction"
  | "rolled-back"
  | "committing"
  | "committed";

let phase: Phase = "read-only";

/** Where an operator should look when this tool cannot say. */
const INSPECT = "Run `npm run db:seed -- --status` to see what is there.";

/**
 * What a failure in each phase is allowed to claim.
 *
 * The reassuring sentence appears exactly once, against the one state that has
 * earned it. An operator told the database is unchanged, when it has just been
 * emptied and refilled, will act on that.
 */
const OUTCOME: Record<Phase, string> = {
  "read-only": "Nothing was written -- this command only reads.",
  "in-transaction":
    "The transaction was open and the rollback could not be confirmed, so the " +
    `database may or may not have changed. ${INSPECT}`,
  "rolled-back": "Rolled back; the database is as it was.",
  committing:
    "The commit was sent but never acknowledged, so the database may or may " +
    `not have changed. ${INSPECT}`,
  committed:
    "This failed AFTER the write was committed, so the database HAS changed. " +
    INSPECT,
};

function reportCounts(counts: Counts): void {
  for (const key of COUNT_KEYS) {
    console.log(`    ${key.padEnd(15)} ${String(counts[key]).padStart(4)}`);
  }
  console.log(
    `    ${"(migrations)".padEnd(15)} ${String(counts.Migrations).padStart(4)}` +
      `   -- history, never touched by seed or reset`,
  );
}

async function status(pool: ConnectionPool): Promise<number> {
  await requireSchema(pool);
  console.log(`db:seed --status\n\n  rows in this application's tables:`);
  reportCounts(await readCounts(pool));
  console.log("");
  return 0;
}

/**
 * Insert the fixtures, but only into an empty schema.
 *
 * The emptiness check runs inside the transaction that would do the inserting,
 * so there is no window between deciding the tables are empty and filling them.
 * A refusal is thrown from inside, which rolls back a transaction that has
 * written nothing -- seed never deletes or overwrites, whatever it finds.
 */
async function seed(pool: ConnectionPool, fixtures: Fixtures): Promise<number> {
  await requireSchema(pool);
  console.log(`db:seed\n`);

  phase = "in-transaction";
  await inTransaction(pool, async (transaction) => {
    const counts = await readCounts(transaction);
    const occupied = COUNT_KEYS.filter((key) => counts[key] > 0);

    if (occupied.length > 0) {
      throw new SeedError(
        `db:seed refuses: this application's tables already hold data.\n\n` +
          occupied
            .map((key) => `      ${key.padEnd(15)} ${counts[key]} row(s)`)
            .join("\n") +
          `\n\n  Nothing was changed and nothing was deleted. Seeding is for an ` +
          `empty schema.\n  To replace what is there:\n\n` +
          `      ${RESET_OPT_IN_VAR}=${RESET_OPT_IN_VALUE} npm run db:reset\n`,
        1,
      );
    }

    await insertFixtures(transaction, fixtures);
  });

  phase = "committed";

  console.log(`  inserted the fixtures. rows now:`);
  reportCounts(await readCounts(pool));
  console.log("");
  return 0;
}

/**
 * Clear this application's domain data and put the fixtures back.
 *
 * One transaction around both halves: a failure anywhere leaves the database
 * exactly as it was, never emptied-but-not-refilled.
 */
async function reset(pool: ConnectionPool, fixtures: Fixtures): Promise<number> {
  await requireSchema(pool);
  console.log(`db:reset\n`);

  const before = await readCounts(pool);
  console.log(`  rows before:`);
  reportCounts(before);

  // The allowlist, printed so the output says exactly what is about to be
  // cleared -- and so a reader can check it against the statements that run.
  console.log(
    `\n  clearing (child to parent): ${DOMAIN_TABLES.join(" -> ")}\n` +
      `  not cleared: Events_SchemaMigrations`,
  );

  phase = "in-transaction";
  await inTransaction(pool, async (transaction) => {
    // The event side first, before anything that references it. This is the
    // same ordering rule `lib/data/seats.ts` follows for one row, applied to
    // the whole table because a reset clears every event: without it, a reset
    // holding the registration rows and a seat claim holding an event row each
    // wait on what the other has. The count is not the point -- acquiring the
    // lock is, and a scan is what acquires it.
    await transaction.request().query(LOCK_EVENTS_TABLE);

    for (const statement of DELETE_STATEMENTS) {
      await transaction.request().query(statement);
    }
    await insertFixtures(transaction, fixtures);
  });

  phase = "committed";

  console.log(`\n  rows after:`);
  const after = await readCounts(pool);
  reportCounts(after);

  if (after.Migrations !== before.Migrations) {
    // Nothing here can do this -- no statement in this file names the history
    // table. Checked anyway, because the one invariant worth being loud about
    // is the one that makes the schema state knowable.
    throw new SeedError(
      `Migration history changed during reset (${before.Migrations} -> ` +
        `${after.Migrations}). This should be impossible; do not trust the ` +
        `schema state until it is understood.`,
      1,
    );
  }

  console.log("");
  return 0;
}

/* --------------------------------------------------------------------- main */

function usage(): number {
  console.error(
    `usage: node lib/data/seed.mts [--reset | --status]\n\n` +
      `  (no flag)    insert the fixtures into an empty application schema\n` +
      `  --reset      clear this application's domain data, then re-seed\n` +
      `  --status     report the row counts; changes nothing\n`,
  );
  return 2;
}

function readConnectionString(): string {
  const value = process.env[CONNECTION_STRING_VAR];
  if (value === undefined || value.trim() === "") {
    throw new SeedError(
      `${CONNECTION_STRING_VAR} is not set.\n` +
        `  Copy .env.example to .env.local and set it to the connection string ` +
        `for the target you want to work against.`,
      2,
    );
  }
  return value;
}

async function main(): Promise<number> {
  // Before anything else, including argument parsing: if the two descriptions
  // of the reset scope disagree, nothing this tool does can be trusted.
  assertAllowlistMatchesStatements();

  const argument = process.argv[2];
  if (process.argv.length > 3) return usage();
  if (
    argument !== undefined &&
    argument !== "--reset" &&
    argument !== "--status"
  ) {
    return usage();
  }

  // Both guards are decided before a connection is opened, so a refusal never
  // reaches the database at all.
  if (argument !== "--status") {
    refuseInProduction(argument === "--reset" ? "db:reset" : "db:seed");
  }
  if (argument === "--reset") requireResetOptIn();

  const connectionString = readConnectionString();
  const redact = createRedactor(connectionString);
  const pool = new sql.ConnectionPool(connectionString);

  try {
    await pool.connect();

    if (argument === "--status") return await status(pool);

    const fixtures = await loadFixtures();
    return argument === "--reset"
      ? await reset(pool, fixtures)
      : await seed(pool, fixtures);
  } catch (error) {
    if (error instanceof SeedError) throw error;
    console.error(`\n  FAILED -- ${describeError(error, redact)}`);
    console.error(`  ${OUTCOME[phase]}\n`);
    return 1;
  } finally {
    await pool.close().catch(() => undefined);
  }
}

let exitCode: number;
try {
  exitCode = await main();
} catch (error) {
  if (error instanceof SeedError) {
    console.error(`\n${error.message}`);
    exitCode = error.exitCode;
  } else {
    throw error;
  }
}

process.exit(exitCode);
