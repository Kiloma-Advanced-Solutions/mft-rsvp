/**
 * Reports what a SQL Server target can tell us about itself, read-only.
 *
 * Two jobs. Today it proves the application can reach the Azure SQL DEV
 * database with the configured connection string. Later, pointed at the real
 * SQL Server 2008 R2 deployment, it is the artifact that performs the checks
 * M6 cannot perform now -- see `docs/sql-server-2008r2-compatibility.md`, which
 * lists them as outstanding.
 *
 * STRICTLY READ-ONLY. It creates nothing, changes nothing, and deletes nothing:
 * no DDL, no DML, no temporary tables, no settings. Every type check is a scalar
 * `SELECT` over a bound parameter, so nothing is persisted to observe a value
 * round-trip. It is safe to run against a shared organizational database.
 *
 *   npm run db:check
 *
 * The connection string is read from the environment and never printed. Output
 * passes through a redactor, and driver errors are reported field by field
 * rather than dumped, because a driver error can carry connection detail.
 *
 * Node built-ins plus `mssql`; no dependency of its own, and it runs with bare
 * `node` because `.mts` is always an ES module.
 */

import { randomUUID } from "node:crypto";

import sql from "mssql";

/**
 * Deliberately duplicated from `lib/data/client.ts` rather than imported.
 *
 * That module is marked `server-only`, a specifier only Next's compiler
 * resolves -- a bare-Node script cannot import it. The separation is wanted
 * anyway: a CLI wants a short-lived pool it closes on the way out, and the
 * application wants a cached one that lives as long as the server. The variable
 * name is the whole of the overlap.
 */
const CONNECTION_STRING_VAR = "EVENTS_DB_CONNECTION_STRING";

/* ------------------------------------------------------------- redaction */

/**
 * Builds a redactor from the connection string without revealing it.
 *
 * Masks credentials and the server address wherever they appear in output,
 * including inside a driver error we did not write. The database name and user
 * are left readable: they are diagnostics this script exists to report, and
 * neither is a credential. The server address is masked because it is
 * infrastructure identity that nothing here needs -- a failure is diagnosed
 * from the error code, not from a host name the operator already knows.
 */
function createRedactor(connectionString: string): (text: string) => string {
  const secrets = new Set<string>([connectionString]);

  for (const pair of connectionString.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;

    const key = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1).trim();
    if (value === "") continue;

    if (/password|pwd|token|secret|key/i.test(key)) {
      secrets.add(value);
    }

    if (/^(server|data source|addr|address|network address)$/i.test(key)) {
      secrets.add(value);
      // A connection string writes `host,port`; the driver reports `host:port`.
      // Adding the bare host masks it in both forms.
      const [host] = value.split(",");
      if (host !== undefined && host.trim() !== "") secrets.add(host.trim());
    }
  }

  // Longest first, so a secret that contains another is masked whole.
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

  // `mssql` wraps the tedious error here, and that is usually where the useful
  // detail is. Only its message is taken; the object itself is never dumped.
  const original = (error as { originalError?: unknown }).originalError;
  if (original instanceof Error) {
    parts.push(`cause: ${redact(original.message)}`);
  }

  return parts.join(" | ");
}

/* ---------------------------------------------------------------- reporting */

type Outcome = "ok" | "info" | "skip" | "fail";

const results: Array<{ outcome: Outcome; label: string; detail: string }> = [];

function record(outcome: Outcome, label: string, detail: string): void {
  results.push({ outcome, label, detail });
}

const MARK: Record<Outcome, string> = {
  ok: "  ok  ",
  info: " info ",
  skip: " skip ",
  fail: " FAIL ",
};

/* ------------------------------------------------------------------- checks */

async function run(): Promise<number> {
  const connectionString = process.env[CONNECTION_STRING_VAR];
  if (connectionString === undefined || connectionString.trim() === "") {
    console.error(
      `${CONNECTION_STRING_VAR} is not set.\n\n` +
        `  Copy .env.example to .env.local and set it to the connection string\n` +
        `  for the target you want to check. This script loads .env.local\n` +
        `  automatically when it is present.\n`,
    );
    return 2;
  }

  const redact = createRedactor(connectionString);
  const pool = new sql.ConnectionPool(connectionString);

  try {
    /* 1 -- connection and authentication */
    await pool.connect();
    record("ok", "connect / authenticate", "connection established");

    /* 2 -- a statement round-trip */
    const ping = await pool.request().query<{ ok: number }>("SELECT 1 AS ok");
    record(
      ping.recordset[0]?.ok === 1 ? "ok" : "fail",
      "SELECT 1",
      `returned ${String(ping.recordset[0]?.ok)}`,
    );

    /* 3, 4, 5, 6 -- server, database, collation and identity */
    const about = await pool.request().query<{
      version: string;
      productVersion: string;
      productLevel: string;
      edition: string;
      engineEdition: number;
      currentDatabase: string;
      collation: string;
      currentUser: string;
      readCommittedSnapshot: number | null;
    }>(`
      SELECT
        @@VERSION                                            AS version,
        CAST(SERVERPROPERTY('ProductVersion') AS nvarchar(128)) AS productVersion,
        CAST(SERVERPROPERTY('ProductLevel')   AS nvarchar(128)) AS productLevel,
        CAST(SERVERPROPERTY('Edition')        AS nvarchar(128)) AS edition,
        CAST(SERVERPROPERTY('EngineEdition')  AS int)           AS engineEdition,
        DB_NAME()                                            AS currentDatabase,
        CAST(DATABASEPROPERTYEX(DB_NAME(), 'Collation') AS nvarchar(128)) AS collation,
        CURRENT_USER                                         AS currentUser,
        -- The catalog view answers where DATABASEPROPERTYEX does not: on Azure
        -- SQL the 'IsReadCommittedSnapshotOn' property comes back NULL, while
        -- sys.databases has it. Both predate the 2008 R2 floor, and the
        -- DB_ID() filter is what makes one query work on either engine --
        -- Azure SQL shows only the current database here, 2008 R2 shows all.
        COALESCE(
            (SELECT CAST(is_read_committed_snapshot_on AS int)
             FROM   sys.databases WHERE database_id = DB_ID()),
            CAST(DATABASEPROPERTYEX(DB_NAME(), 'IsReadCommittedSnapshotOn') AS int)
        )                                                    AS readCommittedSnapshot
    `);
    const info = about.recordset[0];

    record("info", "server product", `${info.edition} (EngineEdition ${info.engineEdition})`);
    record(
      "info",
      "server version",
      `${info.productVersion}${info.productLevel ? ` ${info.productLevel}` : ""}`,
    );
    record("info", "@@VERSION", info.version.split("\n")[0].trim());
    record("info", "current database", info.currentDatabase);
    record("info", "collation", info.collation);
    record("info", "current database user", info.currentUser);

    /* Which flavour of READ COMMITTED this target runs.

       Informational, and it changes nothing about how the application is
       written: the seat-claim transaction in lib/data/seats.ts asks for its
       update lock explicitly with WITH (UPDLOCK, ROWLOCK), which is honoured
       whether or not row versioning is on. It is reported because the two
       engines differ by default -- Azure SQL creates databases with RCSI ON,
       a stock SQL Server 2008 R2 has it OFF -- and a reader should be able to
       see which one the evidence came from rather than assume.

       Nothing here sets it. ALTER DATABASE is forbidden by this project's own
       rules on a shared organizational database. */
    const rcsi = info.readCommittedSnapshot;
    record(
      "info",
      "READ COMMITTED flavour",
      rcsi === 1
        ? "READ_COMMITTED_SNAPSHOT is ON (row versioning) -- UPDLOCK is still honoured"
        : rcsi === 0
          ? "READ_COMMITTED_SNAPSHOT is OFF (locking) -- the 2008 R2 default"
          : "could not be read on this target",
    );

    // The status literals in the M6 CHECK constraints are lower case, so a
    // case-sensitive or binary collation is worth knowing about early.
    const caseSensitive = /_CS_|_BIN/i.test(info.collation);
    record(
      caseSensitive ? "fail" : "ok",
      "collation is case-insensitive",
      caseSensitive
        ? "case-sensitive or binary -- review the CHECK constraint literals"
        : "case-insensitive, as the planned CHECK constraints assume",
    );

    /* 7 -- CREATE TABLE permission, without creating anything.

       `CREATE TABLE` is a DATABASE-scoped permission, so the securable and its
       class have to say so. Called as HAS_PERMS_BY_NAME(NULL, NULL, ...) the
       default class is SERVER, where 'CREATE TABLE' is not a permission at all
       and the answer comes back NULL rather than 0 or 1. */
    const permissions = await pool.request().query<{
      canCreateTable: number | null;
      isDbOwner: number | null;
      isDdlAdmin: number | null;
    }>(`
      SELECT
        HAS_PERMS_BY_NAME(DB_NAME(), 'DATABASE', 'CREATE TABLE') AS canCreateTable,
        IS_ROLEMEMBER('db_owner')                                AS isDbOwner,
        IS_ROLEMEMBER('db_ddladmin')                             AS isDdlAdmin
    `);
    const perms = permissions.recordset[0];
    // db_owner and db_ddladmin both carry CREATE TABLE, so either is sufficient
    // even where the explicit permission check cannot answer.
    const mayCreateTables =
      perms.canCreateTable === 1 || perms.isDbOwner === 1 || perms.isDdlAdmin === 1;
    record(
      mayCreateTables ? "ok" : "fail",
      "CREATE TABLE permission",
      `HAS_PERMS_BY_NAME=${String(perms.canCreateTable)}` +
        `, db_owner=${String(perms.isDbOwner)}` +
        `, db_ddladmin=${String(perms.isDdlAdmin)}` +
        " (permission metadata only -- nothing was created)",
    );

    /* 8 -- uniqueidentifier binding round-trip */
    const uuid = randomUUID();
    const guid = await pool
      .request()
      .input("id", sql.UniqueIdentifier, uuid)
      .query<{ roundTripped: string }>(
        "SELECT CAST(@id AS uniqueidentifier) AS roundTripped",
      );
    const returnedGuid = guid.recordset[0].roundTripped;
    const guidMatches = returnedGuid.toLowerCase() === uuid.toLowerCase();
    record(
      guidMatches ? "ok" : "fail",
      "uniqueidentifier round-trip",
      `value preserved: ${String(guidMatches)}; returned ` +
        `${returnedGuid === returnedGuid.toUpperCase() ? "UPPERCASE" : "as sent"}` +
        " -- the data layer lower-cases on read",
    );

    /* 9 -- datetime2(3) binding round-trip */
    const sent = new Date();
    const stamp = await pool
      .request()
      .input("t", sql.DateTime2(3), sent)
      .query<{ roundTripped: Date }>(
        "SELECT CAST(@t AS datetime2(3)) AS roundTripped",
      );
    const returned = stamp.recordset[0].roundTripped;
    const isoMatches = returned.toISOString() === sent.toISOString();
    // A failure, not a note. An exact round trip is a contract the application
    // relies on rather than a property it would like: `datetime2(3)` is exactly
    // JavaScript's millisecond precision, and on the strength of that
    // `db.events.create` and `claimSeat` both return the record they just wrote
    // instead of re-reading it. If this target does not preserve the value, the
    // API hands a client a timestamp the database does not hold -- silently,
    // and on a write path. A conforming target cannot fail this, so reporting
    // it as `info` only ever hid a target that should have been rejected.
    record(
      isoMatches ? "ok" : "fail",
      "datetime2(3) round-trip",
      isoMatches
        ? "millisecond precision and UTC preserved exactly"
        : `sent ${sent.toISOString()}, got back ${returned.toISOString()}` +
          " -- lib/data/rows.ts and the two create paths assume this is lossless",
    );

    /* 10 -- representative parameter binding, including NULL */
    const bound = await pool
      .request()
      .input("text", sql.NVarChar(sql.MAX), "unicode ✓ שלום")
      .input("number", sql.Int, 42)
      .input("nothing", sql.NVarChar(sql.MAX), null)
      .query<{ text: string; number: number; nothing: string | null }>(
        "SELECT @text AS [text], @number AS [number], @nothing AS [nothing]",
      );
    const row = bound.recordset[0];
    const bindingOk =
      row.text === "unicode ✓ שלום" && row.number === 42 && row.nothing === null;
    record(
      bindingOk ? "ok" : "fail",
      "parameter binding (nvarchar / int / NULL)",
      `unicode preserved: ${String(row.text === "unicode ✓ שלום")}` +
        `, int: ${String(row.number === 42)}` +
        `, SQL NULL arrives as JS null: ${String(row.nothing === null)}`,
    );

    /* 11 -- is the connection actually encrypted? Best effort: the DMV needs a
       permission the account may not have, and that is not a failure. */
    try {
      const transport = await pool.request().query<{
        encryptOption: string;
        protocolType: string;
        netTransport: string;
      }>(`
        SELECT
          encrypt_option AS encryptOption,
          protocol_type  AS protocolType,
          net_transport  AS netTransport
        FROM sys.dm_exec_connections
        WHERE session_id = @@SPID
      `);
      const connection = transport.recordset[0];
      if (connection === undefined) {
        record("skip", "transport encryption", "DMV returned no row for this session");
      } else {
        const encrypted = String(connection.encryptOption).toUpperCase() === "TRUE";
        record(
          encrypted ? "ok" : "fail",
          "transport encryption",
          `encrypt_option=${connection.encryptOption}` +
            `, protocol=${connection.protocolType}` +
            `, transport=${connection.netTransport}`,
        );
      }
    } catch (error) {
      record(
        "skip",
        "transport encryption",
        `sys.dm_exec_connections unavailable: ${describeError(error, redact)}`,
      );
    }

    /* 12 -- pool reuse: a second request must not open a second connection */
    const before = { size: pool.size, borrowed: pool.borrowed };
    const first = await pool.request().query<{ spid: number }>("SELECT @@SPID AS spid");
    const second = await pool.request().query<{ spid: number }>("SELECT @@SPID AS spid");
    record(
      pool.size <= 1 ? "ok" : "info",
      "connection pool reuse",
      `pool size ${before.size} -> ${pool.size}, available ${pool.available}` +
        `, connected=${String(pool.connected)}` +
        `; SPIDs ${first.recordset[0].spid}/${second.recordset[0].spid}` +
        (first.recordset[0].spid === second.recordset[0].spid
          ? " (same connection reused)"
          : " (different connections -- allowed)"),
    );

    return results.some((result) => result.outcome === "fail") ? 1 : 0;
  } catch (error) {
    record("fail", "preflight aborted", describeError(error, redact));
    return 1;
  } finally {
    // Let the CLI exit rather than sitting on an idle pool.
    await pool.close().catch(() => undefined);
  }
}

/* --------------------------------------------------------------------- main */

const exitCode = await run();

// Nothing ran -- the configuration error has already been reported on its own.
if (results.length > 0) {
  console.log(`\ntarget compatibility preflight -- ${CONNECTION_STRING_VAR}\n`);
  for (const { outcome, label, detail } of results) {
    console.log(`[${MARK[outcome]}] ${label}\n            ${detail}`);
  }

  console.log(
    "\nScope of this result: it says what THIS target reported. Success against\n" +
      "Azure SQL is not evidence about a real SQL Server 2008 R2 deployment --\n" +
      "its TLS handshake, certificate, TDS negotiation, driver behaviour,\n" +
      "migration execution and locking semantics remain unverified until this\n" +
      "script is run against that server. See docs/sql-server-2008r2-compatibility.md.\n",
  );
}

process.exit(exitCode);
