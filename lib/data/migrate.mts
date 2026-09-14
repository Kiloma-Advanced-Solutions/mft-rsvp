/**
 * The schema migration runner. A CLI, not part of the application.
 *
 *   npm run db:migrate                # apply every pending migration
 *   npm run db:migrate -- --dry-run   # report the plan; never connects
 *   npm run db:migrate -- --status    # report applied and pending migrations
 *
 * It lives under `lib/data/` rather than `scripts/` for one concrete reason:
 * `lib/data/**` is a scan root of `npm run check:tsql`, so every statement this
 * file authors is held to the SQL Server 2008 R2 feature floor. `scripts/` is
 * not a scan root and must not become one -- `scripts/check-tsql-compat.mts`
 * carries SQL samples inside ordinary strings, and scanning itself would make
 * the guard fail on its own fixtures.
 *
 * Unlike `lib/data/client.ts` this module is deliberately **not** marked
 * `server-only`: that specifier only resolves inside Next's compiler, and this
 * runs under bare `node`. Nothing imports it, so it never reaches a bundle. It
 * also builds its own short-lived pool instead of reusing `getPool()`, for the
 * same reason `scripts/check-target-compatibility.mts` does: a CLI wants a
 * connection it closes on the way out, and the application wants one that lives
 * as long as the server.
 *
 * What it will not do, on purpose. The database is a shared organizational one
 * and the development account holds `db_owner`, so every safeguard here is
 * application-side:
 *
 *   - it executes only files it found under `migrations/`, each matching a
 *     strict name pattern -- a file that does not match is an error, never a
 *     silent skip;
 *   - the only object it names itself is `dbo.Events_SchemaMigrations`, written
 *     as a literal;
 *   - it never enumerates the catalog, never derives a target list at runtime,
 *     and has no destructive statement of any kind;
 *   - it never inserts application data. Fixtures are a later slice.
 *
 * Written to the SQL Server 2008 R2 feature floor and statically enforced;
 * runtime execution has been verified against Azure SQL DEV only. See
 * `docs/sql-server-2008r2-compatibility.md`.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import sql from "mssql";
import type { ConnectionPool } from "mssql";

/**
 * Duplicated from `lib/data/client.ts` rather than imported, because that
 * module is `server-only` and a bare-Node process cannot resolve it. The
 * variable name is the whole of the overlap.
 */
const CONNECTION_STRING_VAR = "EVENTS_DB_CONNECTION_STRING";

const ROOT = resolve(import.meta.dirname, "..", "..");

/** The only directory migrations are ever read out of. */
const MIGRATIONS_DIR = "migrations";

/**
 * `NNNN_lower_snake_case.sql`. The four digits order the file and the whole
 * name is its identity in the history table, so renaming an applied migration
 * makes it pending again -- which is correct: the names *are* the history.
 */
const MIGRATION_NAME = /^(\d{4})_[a-z0-9]+(?:_[a-z0-9]+)*\.sql$/;

/* ------------------------------------------------------------- the runner SQL

   Three statements and one DDL, all naming `Events_SchemaMigrations` as a
   literal. `AppliedAt` is a bound parameter, never a server clock: the
   application owns every timestamp in this project. */

const CREATE_HISTORY_TABLE = `
IF OBJECT_ID(N'dbo.Events_SchemaMigrations', N'U') IS NULL
CREATE TABLE dbo.Events_SchemaMigrations (
    MigrationId nvarchar(200) NOT NULL
                    CONSTRAINT PK_Events_SchemaMigrations PRIMARY KEY,
    AppliedAt   datetime2(3)  NOT NULL
);
`;

const HISTORY_EXISTS = `
SELECT OBJECT_ID(N'dbo.Events_SchemaMigrations', N'U') AS ObjectId;
`;

const SELECT_HISTORY = `
SELECT MigrationId, AppliedAt
FROM   dbo.Events_SchemaMigrations
ORDER  BY MigrationId ASC;
`;

const INSERT_HISTORY = `
INSERT INTO dbo.Events_SchemaMigrations (MigrationId, AppliedAt)
VALUES (@migrationId, @appliedAt);
`;

/* --------------------------------------------------------------------- errors */

/** Something the operator can fix. Reported as a message, not a stack. */
class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationError";
  }
}

/**
 * Builds a masker from the connection string without revealing it.
 *
 * Same approach as `scripts/check-target-compatibility.mts`: credentials and
 * the server address are masked wherever they appear, including inside a driver
 * error we did not write.
 */
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

/* ------------------------------------------------------------------ discovery */

type Migration = { name: string; number: number; path: string };

/**
 * Every migration in `migrations/`, in the order they must be applied.
 *
 * Ordering is the parsed number and then the whole name, never `readdir` order
 * and never a locale-sensitive comparison. Anything unexpected in the directory
 * is an error: a stray `.sql` that is quietly ignored is how a migration goes
 * missing without anybody noticing.
 */
function discover(): Migration[] {
  const directory = join(ROOT, MIGRATIONS_DIR);

  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    throw new MigrationError(
      `Could not read ${MIGRATIONS_DIR}/ -- expected it at ${directory}.`,
    );
  }

  const found: Migration[] = [];
  const strays: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      strays.push(`${entry.name}/ (a directory; migrations are not nested)`);
      continue;
    }

    const match = MIGRATION_NAME.exec(entry.name);
    if (match) {
      found.push({
        name: entry.name,
        number: Number(match[1]),
        path: join(directory, entry.name),
      });
      continue;
    }

    // Only `.sql` is a candidate at all, so a README beside the migrations is
    // fine while a misnamed migration is not.
    if (entry.name.toLowerCase().endsWith(".sql")) strays.push(entry.name);
  }

  if (strays.length > 0) {
    throw new MigrationError(
      `${MIGRATIONS_DIR}/ holds ${strays.length} entr(y/ies) that are not ` +
        `migrations:\n` +
        strays.map((name) => `    ${name}`).join("\n") +
        `\n  Every migration is named NNNN_lower_snake_case.sql. Rename it, or ` +
        `move it out of ${MIGRATIONS_DIR}/.`,
    );
  }

  found.sort((a, b) =>
    a.number - b.number || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
  );

  for (let index = 1; index < found.length; index++) {
    const previous = found[index - 1];
    const current = found[index];
    if (previous.number === current.number) {
      throw new MigrationError(
        `Two migrations share the number ${String(current.number).padStart(4, "0")}: ` +
          `${previous.name} and ${current.name}. Renumber one of them -- the ` +
          `order migrations apply in cannot be ambiguous.`,
      );
    }
  }

  return found;
}

/* ------------------------------------------------------------ batch splitting */

/**
 * Replaces comments, string literals and quoted identifiers with spaces of the
 * same length.
 *
 * Same length, so offsets into the result index the original text unchanged --
 * which is what lets a batch be located in the masked copy and sliced out of
 * the real one. The point is that a line reading `GO` inside a comment or a
 * string is not a batch separator, and must not be treated as one.
 */
function maskNonExecutable(text: string): string {
  const out = text.split("");
  const blank = (start: number, end: number) => {
    for (let index = start; index < end && index < out.length; index++) {
      if (out[index] !== "\n") out[index] = " ";
    }
  };

  const closers: Record<string, string> = { "'": "'", '"': '"', "[": "]" };

  let index = 0;
  while (index < text.length) {
    if (text.startsWith("--", index)) {
      const end = text.indexOf("\n", index);
      const stop = end === -1 ? text.length : end;
      blank(index, stop);
      index = stop;
    } else if (text.startsWith("/*", index)) {
      const end = text.indexOf("*/", index + 2);
      const stop = end === -1 ? text.length : end + 2;
      blank(index, stop);
      index = stop;
    } else if (closers[text[index]] !== undefined) {
      const open = text[index];
      const close = closers[open];
      let cursor = index + 1;
      while (cursor < text.length) {
        // A doubled delimiter is an escaped one and does not close the literal.
        if (text[cursor] === close && text[cursor + 1] === close) cursor += 2;
        else if (text[cursor] === close) break;
        else cursor++;
      }
      blank(index + 1, cursor);
      index = cursor + 1;
    } else {
      index++;
    }
  }

  return out.join("");
}

/** A line that is nothing but `GO`. The only separator form supported. */
const GO_SEPARATOR = /^[ \t]*GO[ \t\r]*$/gim;

/** `GO 5`, `GO xyz` -- a form this runner will not guess at. */
const GO_UNSUPPORTED = /^[ \t]*GO[ \t]+\S/im;

/**
 * One SQL file split into the batches the driver can execute.
 *
 * `GO` is a client batch separator and not T-SQL at all: `mssql` cannot execute
 * a script containing one. Splitting here is what lets the identical `.sql`
 * file run through this runner and by hand in Azure Data Studio.
 */
function splitBatches(name: string, text: string): string[] {
  const masked = maskNonExecutable(text);

  const unsupported = GO_UNSUPPORTED.exec(masked);
  if (unsupported !== null) {
    const line = masked.slice(0, unsupported.index).split("\n").length;
    throw new MigrationError(
      `${name}:${line} has a GO form this runner does not support ` +
        `(${unsupported[0].trim()}). Only a line containing nothing but GO is a ` +
        `batch separator; a repeat count would silently change how often the ` +
        `batch runs.`,
    );
  }

  const cuts: Array<[number, number]> = [];
  GO_SEPARATOR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = GO_SEPARATOR.exec(masked)) !== null) {
    cuts.push([match.index, match.index + match[0].length]);
    if (match.index === GO_SEPARATOR.lastIndex) GO_SEPARATOR.lastIndex++;
  }

  const batches: string[] = [];
  let start = 0;
  const take = (end: number) => {
    // Judge emptiness on the masked copy, so a batch of pure comment is
    // dropped rather than sent to the server as a no-op round trip.
    if (masked.slice(start, end).trim() !== "") {
      batches.push(text.slice(start, end));
    }
  };

  for (const [from, to] of cuts) {
    take(from);
    start = to;
  }
  take(text.length);

  return batches;
}

/* ---------------------------------------------------------------- the database */

type HistoryRow = { MigrationId: string; AppliedAt: Date };

function readConnectionString(): string {
  const value = process.env[CONNECTION_STRING_VAR];
  if (value === undefined || value.trim() === "") {
    throw new MigrationError(
      `${CONNECTION_STRING_VAR} is not set.\n` +
        `  Copy .env.example to .env.local and set it to the connection string ` +
        `for the target you want to migrate. This script loads .env.local ` +
        `automatically when it is present.\n` +
        `  \`--dry-run\` needs no database and no connection string.`,
    );
  }
  return value;
}

/**
 * What the target says it has already applied.
 *
 * The history table cannot itself be a migration -- recording that the
 * migration mechanism was created needs the mechanism -- so the runner owns it,
 * and the `OBJECT_ID` guard makes creating it safe to attempt on every run.
 *
 * `create` is what separates the two callers. Applying migrations needs the
 * table and may create it; `--status` only reports, and a report that quietly
 * performs DDL is a surprise nobody asked for -- so it reads a database with no
 * history yet as "nothing applied" instead.
 */
async function loadHistory(
  pool: ConnectionPool,
  { create }: { create: boolean },
): Promise<{ rows: HistoryRow[]; exists: boolean }> {
  const probe = await pool
    .request()
    .query<{ ObjectId: number | null }>(HISTORY_EXISTS);
  let exists = probe.recordset[0]?.ObjectId != null;

  if (!exists) {
    if (!create) return { rows: [], exists };
    await pool.request().batch(CREATE_HISTORY_TABLE);
    exists = true;
  }

  const history = await pool.request().query<HistoryRow>(SELECT_HISTORY);
  return { rows: history.recordset, exists };
}

/**
 * Applies one migration, all of it or none of it.
 *
 * Every batch and the history row go in a single transaction: any other
 * arrangement leaves a window where the schema changed and the history did not,
 * and the next run would try to create tables that already exist. DDL is
 * transactional in SQL Server, which is what makes this possible.
 */
async function apply(pool: ConnectionPool, migration: Migration): Promise<number> {
  const batches = splitBatches(
    migration.name,
    readFileSync(migration.path, "utf8"),
  );

  if (batches.length === 0) {
    throw new MigrationError(
      `${migration.name} has no executable statements. An empty migration ` +
        `would be recorded as applied and could never be reconsidered.`,
    );
  }

  const transaction = new sql.Transaction(pool);

  // The server can abort a transaction on its own, in which case rolling back
  // again throws. This is the documented way to know that happened.
  let abortedByServer = false;
  transaction.on("rollback", () => {
    abortedByServer = true;
  });

  await transaction.begin();

  try {
    for (let index = 0; index < batches.length; index++) {
      try {
        await transaction.request().batch(batches[index]);
      } catch (error) {
        throw new Error(
          `batch ${index + 1} of ${batches.length} failed`,
          { cause: error },
        );
      }
    }

    await transaction
      .request()
      .input("migrationId", sql.NVarChar(200), migration.name)
      .input("appliedAt", sql.DateTime2(3), new Date())
      .query(INSERT_HISTORY);

    await transaction.commit();
  } catch (error) {
    if (!abortedByServer) await transaction.rollback().catch(() => undefined);
    throw error;
  }

  return batches.length;
}

/* ---------------------------------------------------------------- the commands */

function reportPlan(migrations: Migration[], applied: Set<string>): Migration[] {
  const pending = migrations.filter((migration) => !applied.has(migration.name));

  console.log(
    `  ${migrations.length} migration(s) in ${MIGRATIONS_DIR}/, ` +
      `${migrations.length - pending.length} already applied, ` +
      `${pending.length} pending.`,
  );

  for (const migration of migrations) {
    const state = applied.has(migration.name) ? "applied" : "pending";
    console.log(`    [${state}] ${migration.name}`);
  }

  return pending;
}

/** Discover, split and report. Opens no connection and reads no environment. */
function dryRun(): number {
  const migrations = discover();
  console.log(`db:migrate --dry-run -- no database connection is opened\n`);
  console.log(`  ${migrations.length} migration(s) in ${MIGRATIONS_DIR}/:`);

  for (const migration of migrations) {
    const batches = splitBatches(
      migration.name,
      readFileSync(migration.path, "utf8"),
    );
    console.log(`    ${migration.name} -- ${batches.length} batch(es)`);
  }

  console.log(
    `\n  Applied state is unknown without a connection: each migration above ` +
      `is\n  applied only if dbo.Events_SchemaMigrations does not already list ` +
      `it.\n  Run \`npm run db:migrate -- --status\` to see which are pending.\n`,
  );

  return 0;
}

async function status(pool: ConnectionPool): Promise<number> {
  const migrations = discover();
  const { rows: history, exists } = await loadHistory(pool, { create: false });
  const applied = new Set(history.map((row) => row.MigrationId));

  console.log(`db:migrate --status\n`);
  if (!exists) {
    console.log(
      `  dbo.Events_SchemaMigrations does not exist yet, so nothing has been ` +
        `applied.\n  \`npm run db:migrate\` creates it.\n`,
    );
  }
  reportPlan(migrations, applied);

  if (history.length > 0) {
    console.log(`\n  history (dbo.Events_SchemaMigrations):`);
    for (const row of history) {
      console.log(`    ${row.MigrationId}  applied ${row.AppliedAt.toISOString()}`);
    }
  }

  // A recorded migration whose file is gone is worth saying out loud; it is not
  // an error, because history is deliberately never rewritten.
  const orphans = history
    .map((row) => row.MigrationId)
    .filter((id) => !migrations.some((migration) => migration.name === id));
  if (orphans.length > 0) {
    console.log(
      `\n  recorded but no longer present in ${MIGRATIONS_DIR}/: ` +
        orphans.join(", "),
    );
  }

  console.log("");

  // Reporting is not a verdict: pending migrations are the normal state before
  // a run, so `--status` succeeds whatever it finds.
  return 0;
}

async function migrate(pool: ConnectionPool, redact: (text: string) => string): Promise<number> {
  const migrations = discover();
  const { rows: history } = await loadHistory(pool, { create: true });
  const applied = new Set(history.map((row) => row.MigrationId));

  console.log(`db:migrate\n`);
  const pending = reportPlan(migrations, applied);

  if (pending.length === 0) {
    console.log(`\n  Nothing to apply.\n`);
    return 0;
  }

  console.log("");

  for (const migration of pending) {
    try {
      const batches = await apply(pool, migration);
      console.log(`  applied  ${migration.name}  (${batches} batch(es))`);
    } catch (error) {
      console.error(
        `  FAILED   ${migration.name}\n` +
          `           ${describeError(error, redact)}\n` +
          `           rolled back; nothing was recorded for this migration.`,
      );
      const cause = (error as { cause?: unknown }).cause;
      if (cause !== undefined) {
        console.error(`           ${describeError(cause, redact)}`);
      }
      // Stop at the first failure. Later migrations may depend on this one, and
      // guessing which do is not this runner's job.
      console.error(
        `\n  Stopped. ${pending.indexOf(migration)} of ${pending.length} ` +
          `pending migration(s) were applied before this one.\n`,
      );
      return 1;
    }
  }

  console.log(`\n  ${pending.length} migration(s) applied.\n`);
  return 0;
}

/* ---------------------------------------------------------------------- main */

function usage(): number {
  console.error(
    `usage: node lib/data/migrate.mts [--dry-run | --status]\n\n` +
      `  (no flag)    apply every pending migration\n` +
      `  --dry-run    report the plan; opens no connection\n` +
      `  --status     report applied and pending migrations\n`,
  );
  return 2;
}

async function main(): Promise<number> {
  const argument = process.argv[2];
  if (process.argv.length > 3) return usage();

  if (argument === "--dry-run") return dryRun();
  if (argument !== undefined && argument !== "--status") return usage();

  const connectionString = readConnectionString();
  const redact = createRedactor(connectionString);
  const pool = new sql.ConnectionPool(connectionString);

  try {
    await pool.connect();
    return argument === "--status"
      ? await status(pool)
      : await migrate(pool, redact);
  } catch (error) {
    console.error(`db:migrate aborted -- ${describeError(error, redact)}`);
    return 1;
  } finally {
    // Let the CLI exit rather than sitting on an idle pool.
    await pool.close().catch(() => undefined);
  }
}

let exitCode: number;
try {
  exitCode = await main();
} catch (error) {
  if (error instanceof MigrationError) {
    console.error(error.message);
    exitCode = 2;
  } else {
    throw error;
  }
}

process.exit(exitCode);
