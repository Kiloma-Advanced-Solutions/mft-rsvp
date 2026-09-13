/**
 * Guards the SQL Server 2008 R2 feature floor.
 *
 * The problem it exists for: the database we develop against is Azure SQL,
 * which happily accepts T-SQL that a real SQL Server 2008 R2 server would
 * refuse. `DROP TABLE IF EXISTS`, `THROW`, `TRIM`, any JSON function -- all run
 * fine in DEV and all fail on the deployment target. Nothing else in the
 * toolchain notices, so this does.
 *
 * It is a curated scanner, deliberately **not** a T-SQL parser, and it proves
 * nothing about the real server -- see `docs/sql-server-2008r2-compatibility.md`
 * for what it does and does not guarantee.
 *
 * Node built-ins only, so it runs with bare `node` and needs no dependency:
 *
 *   npm run check:tsql
 *   node scripts/check-tsql-compat.mts --selftest
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/**
 * Where T-SQL is allowed to live. An allow-list rather than an exclude-list:
 * that is what keeps this file and the fixtures beside it out of the scan
 * without needing a rule to say so.
 *
 * **Any new home for T-SQL must be added here in the same commit.** This is the
 * guard's one maintenance obligation.
 */
const SCAN_ROOTS = [
  { dir: "migrations", extensions: [".sql"] },
  { dir: "lib/data", extensions: [".ts", ".mts"] },
];

/** Fixtures for `--selftest`. Never part of a normal scan. */
const FIXTURES = {
  allowed: "scripts/tsql-fixtures/allowed.sql",
  rejected: "scripts/tsql-fixtures/forbidden.sql",
};

const CONTRACT_DOC = "docs/sql-server-2008r2-compatibility.md";

type Rule = {
  /** Stable identifier, also the key the contract document is checked against. */
  id: string;
  pattern: RegExp;
  /** What to write instead. Shown on every finding, because that is the useful part. */
  instead: string;
  /** Which SQL Server first shipped it. `FORBIDDEN` only. */
  since?: string;
  /**
   * A second opinion on a match, for rules whose problem is what a construct
   * *targets* rather than that it appears at all.
   *
   * A pattern alone can say "this is a `CREATE TABLE`"; only a predicate can
   * say "and the table it creates is not one of ours". Omitted means every
   * match is a finding, which is how every FORBIDDEN and DISCOURAGED rule works.
   */
  violates?: (match: RegExpExecArray) => boolean;
};

/**
 * Introduced after SQL Server 2008 R2. Using one of these breaks the
 * compatibility floor.
 *
 * Curated rather than exhaustive: these are the constructs somebody writing
 * *this* schema and data layer might plausibly reach for. A complete
 * SQL-version database would be longer without catching more of our mistakes.
 */
const FORBIDDEN: Rule[] = [
  {
    id: "drop-if-exists",
    pattern:
      /\bDROP\s+(TABLE|INDEX|VIEW|PROCEDURE|PROC|FUNCTION|TRIGGER|CONSTRAINT|COLUMN|SCHEMA|SEQUENCE|TYPE|DATABASE)\s+IF\s+EXISTS\b/i,
    since: "2016",
    instead: "IF OBJECT_ID(N'dbo.X', N'U') IS NOT NULL DROP TABLE dbo.X;",
  },
  {
    id: "create-or-alter",
    pattern: /\bCREATE\s+OR\s+ALTER\b/i,
    since: "2016",
    instead: "IF OBJECT_ID(N'dbo.X') IS NULL CREATE ... ELSE ALTER ...",
  },
  {
    id: "throw",
    pattern: /\bTHROW\b/i,
    since: "2012",
    instead: "RAISERROR(N'message', 16, 1)",
  },
  {
    id: "try-convert-cast-parse",
    pattern: /\bTRY_(CONVERT|CAST|PARSE)\s*\(/i,
    since: "2012",
    instead: "validate in the application (lib/eventInput.ts), or ISDATE/ISNUMERIC",
  },
  {
    id: "parse",
    pattern: /\bPARSE\s*\(/i,
    since: "2012",
    instead: "CONVERT(...), or parse in the application",
  },
  {
    id: "concat",
    pattern: /\bCONCAT\s*\(/i,
    since: "2012",
    instead: "the + operator with ISNULL(x, N'')",
  },
  {
    id: "concat-ws",
    pattern: /\bCONCAT_WS\s*\(/i,
    since: "2017",
    instead: "the + operator with ISNULL(x, N'')",
  },
  {
    id: "string-split-agg",
    pattern: /\bSTRING_(SPLIT|AGG)\s*\(/i,
    since: "2016 / 2017",
    instead: "a junction table (Events_EventCoHosts, Events_EventInvites)",
  },
  {
    id: "trim",
    pattern: /\bTRIM\s*\(/i,
    since: "2017",
    instead: "LTRIM(RTRIM(x))",
  },
  {
    id: "at-time-zone",
    pattern: /\bAT\s+TIME\s+ZONE\b/i,
    since: "2016",
    instead: "store UTC in datetime2(3) and convert in the application",
  },
  {
    id: "json-functions",
    pattern:
      /\b(ISJSON|JSON_VALUE|JSON_QUERY|JSON_MODIFY|JSON_PATH_EXISTS|OPENJSON)\s*\(/i,
    since: "2016",
    instead: "flat columns and junction tables",
  },
  {
    id: "for-json",
    pattern: /\bFOR\s+JSON\b/i,
    since: "2016",
    instead: "shape the result in the application",
  },
  {
    id: "fetch-next",
    pattern: /\bFETCH\s+(NEXT|FIRST)\b/i,
    since: "2012",
    instead: "TOP (n), or ROW_NUMBER() in a subquery",
  },
  {
    id: "offset-rows",
    pattern: /\bOFFSET\s+\S+\s+ROWS?\b/i,
    since: "2012",
    instead: "TOP (n), or ROW_NUMBER() in a subquery",
  },
  {
    id: "iif",
    pattern: /\bIIF\s*\(/i,
    since: "2012",
    instead: "CASE WHEN ... THEN ... ELSE ... END",
  },
  {
    id: "choose",
    pattern: /\bCHOOSE\s*\(/i,
    since: "2012",
    instead: "CASE WHEN ... THEN ... ELSE ... END",
  },
  {
    id: "format",
    pattern: /\bFORMAT\s*\(/i,
    since: "2012",
    instead: "CONVERT(...) with a style, or format in lib/date.ts",
  },
  {
    id: "eomonth",
    pattern: /\bEOMONTH\s*\(/i,
    since: "2012",
    instead: "DATEADD/DATEDIFF arithmetic",
  },
  {
    id: "fromparts",
    pattern:
      /\b(DATE|DATETIME|DATETIME2|DATETIMEOFFSET|SMALLDATETIME|TIME)FROMPARTS\s*\(/i,
    since: "2012",
    instead: "build the value in the application and bind it as a parameter",
  },
  {
    id: "create-sequence",
    pattern: /\bCREATE\s+SEQUENCE\b/i,
    since: "2012",
    instead: "not needed -- ids are application-generated UUIDs",
  },
  {
    id: "next-value-for",
    pattern: /\bNEXT\s+VALUE\s+FOR\b/i,
    since: "2012",
    instead: "not needed -- ids are application-generated UUIDs",
  },
  {
    id: "post-2008-window-functions",
    pattern:
      /\b(LAG|LEAD|FIRST_VALUE|LAST_VALUE|PERCENTILE_CONT|PERCENTILE_DISC|CUME_DIST|PERCENT_RANK)\s*\(/i,
    since: "2012",
    instead: "ROW_NUMBER(), RANK(), DENSE_RANK() and NTILE() are available (2005)",
  },
  {
    id: "window-frame",
    pattern: /\b(ROWS|RANGE)\s+BETWEEN\b/i,
    since: "2012",
    instead: "a self-join or a correlated subquery",
  },
  {
    id: "greatest-least",
    pattern: /\b(GREATEST|LEAST)\s*\(/i,
    since: "2022",
    instead: "CASE WHEN a > b THEN a ELSE b END",
  },
];

/**
 * Available at the floor, rejected by this project's own design. Not a
 * compatibility problem -- reported separately so the compatibility claim above
 * never gets diluted by our style choices.
 */
const DISCOURAGED: Rule[] = [
  {
    id: "merge",
    pattern: /\bMERGE\b/i,
    instead:
      "an explicit IF EXISTS ... UPDATE ELSE INSERT inside the transaction that already holds the row lock",
  },
  {
    id: "datetime-type",
    pattern: /\bdatetime\b(?!2)/i,
    instead:
      "datetime2(3) -- datetime rounds to ~3.33ms and would corrupt the stored ISO timestamp",
  },
  {
    id: "rowversion",
    pattern: /\b(timestamp|rowversion)\b/i,
    instead:
      "datetime2(3) for dates. SQL Server `timestamp` is rowversion: a binary row counter, not a time",
  },
  {
    id: "server-clock",
    pattern:
      /\b(GETDATE|GETUTCDATE|SYSDATETIME|SYSUTCDATETIME|SYSDATETIMEOFFSET)\s*\(/i,
    instead:
      "a bound parameter -- the application supplies every timestamp, as lib/db.ts does today",
  },
  {
    id: "current-timestamp",
    pattern: /\bCURRENT_TIMESTAMP\b/i,
    instead: "a bound parameter -- the application supplies every timestamp",
  },
  {
    id: "identity",
    pattern: /\bIDENTITY\b/i,
    instead: "a uniqueidentifier column -- ids are application-generated UUIDs",
  },
  {
    id: "scope-identity",
    pattern: /\bSCOPE_IDENTITY\s*\(/i,
    instead: "nothing -- there are no IDENTITY columns to read back",
  },
  {
    id: "newsequentialid",
    pattern: /\bNEWSEQUENTIALID\s*\(/i,
    instead:
      "nothing -- every id is generated by the application with crypto.randomUUID(), " +
      "and the columns deliberately carry no UUID default at all",
  },
  {
    id: "alter-database",
    pattern: /\bALTER\s+DATABASE\b/i,
    instead:
      "nothing -- this is a shared organizational database and its settings are not ours to change",
  },
  {
    id: "snapshot-isolation",
    pattern:
      /\b(ALLOW_SNAPSHOT_ISOLATION|READ_COMMITTED_SNAPSHOT|ISOLATION\s+LEVEL\s+SNAPSHOT)\b/i,
    instead:
      "WITH (UPDLOCK, ROWLOCK) on the event row under the default READ COMMITTED",
  },
  {
    id: "truncate",
    pattern: /\bTRUNCATE\s+TABLE\b/i,
    instead:
      "DELETE against the explicitly named Events_* tables -- TRUNCATE also fails on a table a foreign key references",
  },
  {
    id: "drop-database-or-schema",
    pattern: /\bDROP\s+(DATABASE|SCHEMA)\b/i,
    instead:
      "nothing -- only application-owned Events_* objects may ever be dropped",
  },
];

/* ---------------------------------------------------------------- ownership */

/**
 * An identifier: bracketed, double-quoted, or bare. `@` and `#` are included
 * because `#temp` and `##global` are table names too, and this project wants
 * them refused along with everything else it does not own.
 */
const IDENTIFIER = String.raw`(?:\[[^\]]+\]|"[^"]+"|[A-Za-z_@#][\w@#$]*)`;

/** `Thing`, `dbo.Thing`, `[db].[dbo].[Thing]` -- any qualification. */
const QUALIFIED = String.raw`${IDENTIFIER}(?:\s*\.\s*${IDENTIFIER})*`;

/**
 * The table a piece of DDL acts on.
 *
 * Two shapes, because the target sits in a different place in each: after the
 * verb for `CREATE`/`ALTER`/`DROP TABLE`, and after `ON` for index DDL. An
 * optional `IF EXISTS` is stepped over rather than read as the object name --
 * `drop-if-exists` is what reports that, and one mistake should produce one
 * finding.
 *
 * Not covered: the deprecated `DROP INDEX table.index` form, which puts the
 * table in the middle of a dotted name. Nothing here writes it, and the modern
 * `DROP INDEX index ON table` form is what this matches.
 */
const DDL_TARGET = new RegExp(
  String.raw`\b(?:CREATE|ALTER|DROP)\s+TABLE\s+(?:IF\s+EXISTS\s+)?(${QUALIFIED})` +
    "|" +
    String.raw`\b(?:CREATE|DROP)\s+(?:UNIQUE\s+)?(?:CLUSTERED\s+|NONCLUSTERED\s+)?INDEX\s+${QUALIFIED}\s+ON\s+(${QUALIFIED})`,
  "i",
);

/**
 * The table a matched statement acts on: the first capture group that took
 * part, reduced to its last dotted part with brackets or quotes removed.
 *
 * Each pattern below is an alternation whose branches capture the target from a
 * different position, so exactly one group is ever defined per match. Reading
 * "whichever group matched" keeps one extractor working for all of them however
 * many branches a pattern grows.
 */
function statementTarget(match: RegExpExecArray): string {
  const qualified = match.slice(1).find((group) => group !== undefined) ?? "";
  const last = /(?:\[([^\]]+)\]|"([^"]+)"|([A-Za-z_@#][\w@#$]*))\s*$/.exec(qualified);
  if (last === null) return qualified;
  return last[1] ?? last[2] ?? last[3] ?? "";
}

/** Whether a target is one of this application's own tables. */
function isOwned(target: string): boolean {
  return target.toLowerCase().startsWith(OWNED_PREFIX.toLowerCase());
}

/**
 * The table a write statement acts on.
 *
 * Each branch demands the shape a real statement has, not just its verb, and
 * every part of that is load-bearing:
 *
 *   - `FROM` is required after `DELETE`, which is what keeps the rule off
 *     `ON DELETE NO ACTION` -- a clause on all eight foreign keys in
 *     `migrations/0001` that a looser pattern reads as eight deletes of a table
 *     called `NO`.
 *   - `UPDATE` must be followed by its `SET` clause. That excludes `MERGE`'s
 *     `WHEN MATCHED THEN UPDATE SET`, which names no target -- and, just as
 *     importantly, ordinary English. `Could not update the event` is the kind of
 *     message this repository writes, and `UPDATE` is a SQL anchor, so without
 *     the `SET` requirement that literal reports a write to a table called
 *     `the`.
 *   - `INSERT INTO` and `DELETE FROM` must be followed by a column list, a
 *     `VALUES`/`SELECT`, a `WHERE`, or the end of the statement, for the same
 *     reason: `insert into the list` and `delete from the queue` are English.
 *
 * Reads are absent by design: `SELECT` may look anywhere, including at catalog
 * views. This rule is about what the repository *writes*.
 *
 * Not covered: the `FROM`-less forms (`INSERT dbo.T …`, `DELETE dbo.T`), which
 * are legal T-SQL nothing here writes; and `UPDATE <alias> … FROM <table> AS
 * <alias>`, where the alias would be read as the target. Write the statements
 * the way this repository already does and neither arises.
 */
const INSERT_TAIL = String.raw`\s*(?:\(|VALUES\b|SELECT\b|DEFAULT\b|EXEC\b|$)`;
const UPDATE_TAIL = String.raw`\s+(?:WITH\s*\([^)]*\)\s+)?SET\b`;
const DELETE_TAIL = String.raw`\s*(?:WHERE\b|OPTION\b|;|$)`;

const DML_TARGET = new RegExp(
  String.raw`\bINSERT\s+INTO\s+(${QUALIFIED})${INSERT_TAIL}` +
    "|" +
    String.raw`\bUPDATE\s+(${QUALIFIED})${UPDATE_TAIL}` +
    "|" +
    String.raw`\bDELETE\s+FROM\s+(${QUALIFIED})${DELETE_TAIL}`,
  "im",
);

/**
 * A statement that would change rows already in the migration history, as
 * opposed to appending one.
 *
 * `INSERT` is deliberately not here: recording a migration is the one write the
 * history table exists for.
 */
const HISTORY_MUTATION = new RegExp(
  String.raw`\bUPDATE\s+(${QUALIFIED})${UPDATE_TAIL}` +
    "|" +
    String.raw`\bDELETE\s+FROM\s+(${QUALIFIED})${DELETE_TAIL}` +
    "|" +
    String.raw`\bTRUNCATE\s+TABLE\s+(${QUALIFIED})`,
  "im",
);

/** The prefix every table this application creates must carry. */
const OWNED_PREFIX = "Events_";

/** The runner's own history table, which records what has been applied. */
const HISTORY_TABLE = "Events_SchemaMigrations";

/**
 * Objects this application does not own. Not a compatibility question at all --
 * a third class so the 2008 R2 claim is never diluted by it, and so the report
 * says which kind of mistake was made.
 *
 * The database is a shared organizational one and the development account holds
 * `db_owner`, so nothing on the server side would stop a mistyped
 * `CREATE TABLE Users`. This is what stops it.
 */
const OWNERSHIP: Rule[] = [
  {
    id: "events-table-prefix",
    pattern: DDL_TARGET,
    instead: `dbo.${OWNED_PREFIX}Thing -- every table this application creates, alters, drops or indexes is its own, and its name has to say so`,
    violates: (match) => !isOwned(statementTarget(match)),
  },
  {
    id: "events-dml-target-prefix",
    pattern: DML_TARGET,
    instead: `dbo.${OWNED_PREFIX}Thing -- this application only ever writes to tables it owns, and a table name that does not say so is the one mistake db_owner would not stop`,
    violates: (match) => !isOwned(statementTarget(match)),
  },
  {
    id: "events-migration-history-immutable",
    pattern: HISTORY_MUTATION,
    instead: `nothing -- dbo.${HISTORY_TABLE} is appended to and never otherwise changed. Wiping it would make the schema state unknowable, and it is deliberately not one of the tables a data reset clears`,
    violates: (match) =>
      statementTarget(match).toLowerCase() === HISTORY_TABLE.toLowerCase(),
  },
];

/**
 * A literal only counts as T-SQL if it contains one of these.
 *
 * `DROP INDEX` earns its place here even though nothing writes one: without it
 * a template literal holding nothing but `DROP INDEX ... ON <table>` is not read
 * as SQL at all, and `events-table-prefix` never gets to see the table it names.
 */
const SQL_ANCHOR =
  /\b(SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|CREATE\s+TABLE|CREATE\s+INDEX|DROP\s+INDEX|ALTER\s+TABLE|DROP\s+TABLE|FROM|WHERE|VALUES|ORDER\s+BY|GROUP\s+BY|JOIN|BEGIN\s+TRAN|COMMIT\s+TRAN|ROLLBACK\s+TRAN|TRUNCATE)\b/i;

type Finding = {
  file: string;
  line: number;
  cls: "FORBIDDEN" | "DISCOURAGED" | "OWNERSHIP";
  rule: Rule;
  excerpt: string;
};

/**
 * Replaces comments and string literals with spaces of the same length.
 *
 * Same length, so byte offsets -- and therefore reported line numbers -- stay
 * true. Blanking rather than deleting is also what lets a comment explain that
 * `DROP TABLE IF EXISTS` is banned without the explanation failing the check,
 * and what stops a construct named inside a RAISERROR message being read as
 * executable SQL.
 */
function blankNonCode(sql: string): string {
  const out = sql.split("");
  let i = 0;
  const blank = (from: number, to: number) => {
    for (let k = from; k < to && k < out.length; k++) {
      if (out[k] !== "\n") out[k] = " ";
    }
  };

  while (i < sql.length) {
    if (sql.startsWith("--", i)) {
      const end = sql.indexOf("\n", i);
      blank(i, end === -1 ? sql.length : end);
      i = end === -1 ? sql.length : end;
    } else if (sql.startsWith("/*", i)) {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (sql[i] === "'") {
      let k = i + 1;
      while (k < sql.length) {
        if (sql[k] === "'" && sql[k + 1] === "'") k += 2;
        else if (sql[k] === "'") break;
        else k++;
      }
      blank(i + 1, k);
      i = k + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

/** Blanks everything that is not inside a SQL-looking template literal. */
function keepOnlySqlTemplateLiterals(source: string): string {
  const out: string[] = source.split("").map((c) => (c === "\n" ? "\n" : " "));

  let i = 0;
  while (i < source.length) {
    if (source[i] === "`") {
      let k = i + 1;
      while (k < source.length && source[k] !== "`") {
        if (source[k] === "\\") k += 2;
        else k++;
      }
      const body = source.slice(i + 1, k);
      if (SQL_ANCHOR.test(body)) {
        for (let p = i + 1; p < k; p++) out[p] = source[p];
      }
      i = k + 1;
    } else {
      i++;
    }
  }
  return out.join("");
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) {
    if (text[i] === "\n") line++;
  }
  return line;
}

function scanText(file: string, searchable: string): Finding[] {
  const findings: Finding[] = [];
  const classes: Array<[Finding["cls"], Rule[]]> = [
    ["FORBIDDEN", FORBIDDEN],
    ["DISCOURAGED", DISCOURAGED],
    ["OWNERSHIP", OWNERSHIP],
  ];

  for (const [cls, rules] of classes) {
    for (const rule of rules) {
      const re = new RegExp(rule.pattern.source, rule.pattern.flags.includes("g")
        ? rule.pattern.flags
        : `${rule.pattern.flags}g`);
      let match: RegExpExecArray | null;
      while ((match = re.exec(searchable)) !== null) {
        if (rule.violates === undefined || rule.violates(match)) {
          findings.push({
            file,
            line: lineOf(searchable, match.index),
            cls,
            rule,
            excerpt: match[0].replace(/\s+/g, " ").trim(),
          });
        }
        if (match.index === re.lastIndex) re.lastIndex++;
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.rule.id.localeCompare(b.rule.id));
}

function scanFile(absolute: string): Finding[] {
  const file = relative(ROOT, absolute);
  const source = readFileSync(absolute, "utf8");
  const searchable = file.endsWith(".sql")
    ? blankNonCode(source)
    : blankNonCode(keepOnlySqlTemplateLiterals(source));
  return scanText(file, searchable);
}

function filesUnder(dir: string, extensions: string[]): string[] {
  const absolute = join(ROOT, dir);
  let entries: string[];
  try {
    if (!statSync(absolute).isDirectory()) return [];
    entries = readdirSync(absolute);
  } catch {
    return []; // A scan root that does not exist yet is not an error.
  }

  const found: string[] = [];
  for (const entry of entries) {
    const child = join(absolute, entry);
    if (statSync(child).isDirectory()) {
      found.push(...filesUnder(join(dir, entry), extensions));
    } else if (extensions.some((extension) => entry.endsWith(extension))) {
      found.push(child);
    }
  }
  return found.sort();
}

function report(findings: Finding[]): void {
  for (const finding of findings) {
    const since = finding.rule.since ? ` [SQL Server ${finding.rule.since}]` : "";
    console.error(
      `${finding.file}:${finding.line}  ${finding.cls}  ${finding.rule.id}${since}\n` +
        `    found:   ${finding.excerpt}\n` +
        `    instead: ${finding.rule.instead}`,
    );
  }
}

function runScan(): number {
  const files = SCAN_ROOTS.flatMap((root) => filesUnder(root.dir, root.extensions));
  const findings = files.flatMap(scanFile);

  const roots = SCAN_ROOTS.map((root) => `${root.dir}/`).join(", ");
  console.log(`check:tsql -- scanned ${files.length} file(s) under ${roots}`);

  if (files.length === 0) {
    console.log(
      "  no T-SQL in the repository yet, so nothing was checked. A zero-file\n" +
        "  pass is not evidence of SQL coverage -- see the note in\n" +
        `  ${CONTRACT_DOC}.`,
    );
  }

  if (findings.length === 0) {
    if (files.length > 0) console.log("  no findings.");
    return 0;
  }

  console.error("");
  report(findings);
  const count = (cls: Finding["cls"]) =>
    findings.filter((finding) => finding.cls === cls).length;
  console.error(
    `\n${findings.length} finding(s): ${count("FORBIDDEN")} FORBIDDEN (after ` +
      `the 2008 R2 floor), ${count("DISCOURAGED")} DISCOURAGED (available, ` +
      `rejected by design), ${count("OWNERSHIP")} OWNERSHIP (an object this ` +
      `application does not own).`,
  );
  return 1;
}

/* ----------------------------------------------------------------- selftest */

type Check = { name: string; ok: boolean; detail?: string };

/** Pairs that must discriminate: [rule id, sample, should it match]. */
const DISCRIMINATION: Array<[string, string, boolean]> = [
  ["trim", "SELECT RTRIM(LTRIM(Name)) FROM dbo.Events_Users", false],
  ["trim", "SELECT TRIM(Name) FROM dbo.Events_Users", true],
  ["concat", "SELECT CONCAT_WS(N',', a, b) FROM t", false],
  ["concat", "SELECT CONCAT(a, b) FROM t", true],
  ["datetime-type", "SELECT CreatedAt FROM t WHERE CreatedAt > CAST(N'x' AS datetime2)", false],
  ["datetime-type", "ALTER TABLE t ADD CreatedAt datetime NOT NULL", true],
  ["rowversion", "SELECT UpdatedAt FROM t WHERE UpdatedAt > CAST(N'x' AS datetime2)", false],
  ["rowversion", "ALTER TABLE t ADD Ver rowversion", true],
  [
    "drop-if-exists",
    "IF OBJECT_ID(N'dbo.Events_Users', N'U') IS NOT NULL DROP TABLE dbo.Events_Users;",
    false,
  ],
  ["drop-if-exists", "DROP TABLE IF EXISTS dbo.Events_Users;", true],
  ["throw", "SELECT 1 FROM t; RAISERROR(N'no THROW here', 16, 1);", false],
  ["fetch-next", "SELECT TOP (10) Id FROM t ORDER BY CreatedAt ASC", false],
  ["fetch-next", "SELECT Id FROM t ORDER BY CreatedAt OFFSET 10 ROWS FETCH NEXT 10 ROWS ONLY", true],
  ["iif", "SELECT CASE WHEN Capacity IS NULL THEN 1 ELSE 0 END FROM t", false],
  ["iif", "SELECT IIF(Capacity IS NULL, 1, 0) FROM t", true],
  ["format", "SELECT FORMATMESSAGE(N'%s', Name) FROM t", false],
  ["format", "SELECT FORMAT(CreatedAt, N'yyyy') FROM t", true],
  ["post-2008-window-functions", "SELECT ROW_NUMBER() OVER (ORDER BY CreatedAt) FROM t", false],
  ["post-2008-window-functions", "SELECT LAG(Id) OVER (ORDER BY CreatedAt) FROM t", true],
  ["identity", "SELECT SCOPE_IDENTITY() FROM t", false],
  ["identity", "CREATE TABLE t (Id int IDENTITY(1,1))", true],
  ["current-timestamp", "SELECT Ver FROM t WHERE Ver > CAST(N'x' AS datetime2)", false],
  ["current-timestamp", "UPDATE t SET UpdatedAt = CURRENT_TIMESTAMP", true],
  // events-table-prefix: what the application owns, and what it does not.
  ["events-table-prefix", "CREATE TABLE dbo.Events_Users (Id uniqueidentifier NOT NULL)", false],
  ["events-table-prefix", "CREATE TABLE [dbo].[Events_Users] (Id uniqueidentifier NOT NULL)", false],
  ["events-table-prefix", "CREATE TABLE Events_Users (Id uniqueidentifier NOT NULL)", false],
  ["events-table-prefix", "CREATE TABLE dbo.Users (Id uniqueidentifier NOT NULL)", true],
  ["events-table-prefix", "CREATE TABLE [dbo].[Payroll] (Id uniqueidentifier NOT NULL)", true],
  ["events-table-prefix", "ALTER TABLE dbo.Events_Events ADD Note nvarchar(max) NULL", false],
  ["events-table-prefix", "ALTER TABLE dbo.Departments ADD Note nvarchar(max) NULL", true],
  // `IF EXISTS` is stepped over, so drop-if-exists reports it and this does not.
  ["events-table-prefix", "DROP TABLE IF EXISTS dbo.Events_Users;", false],
  ["events-table-prefix", "DROP TABLE dbo.Salaries;", true],
  [
    "events-table-prefix",
    "CREATE UNIQUE NONCLUSTERED INDEX IX_A ON dbo.Events_Registrations (EventId)",
    false,
  ],
  ["events-table-prefix", "CREATE INDEX IX_A ON dbo.Payroll (Id)", true],
  ["events-table-prefix", "DROP INDEX IX_A ON dbo.Events_Users", false],
  ["events-table-prefix", "DROP INDEX IX_A ON dbo.Payroll", true],
  // Temp tables are refused too: nothing here creates one.
  ["events-table-prefix", "CREATE TABLE #Scratch (Id int NULL)", true],
  // A table variable is not a table, and a read is not DDL.
  ["events-table-prefix", "DECLARE @Rows TABLE (Id uniqueidentifier NOT NULL)", false],
  ["events-table-prefix", "SELECT Id FROM dbo.Payroll ORDER BY Id ASC", false],
  // events-dml-target-prefix: writes must name a table this application owns.
  ["events-dml-target-prefix", "INSERT INTO dbo.Events_Users (Id) VALUES (@id)", false],
  ["events-dml-target-prefix", "INSERT INTO dbo.Invoices (Id) VALUES (@id)", true],
  ["events-dml-target-prefix", "UPDATE dbo.Events_Events SET Title = @title", false],
  ["events-dml-target-prefix", "UPDATE dbo.Salaries SET Amount = @amount", true],
  ["events-dml-target-prefix", "DELETE FROM dbo.Events_Registrations", false],
  ["events-dml-target-prefix", "DELETE FROM dbo.Payroll", true],
  ["events-dml-target-prefix", "INSERT INTO [dbo].[Events_EventInvites] (EventId) VALUES (@e)", false],
  ["events-dml-target-prefix", "INSERT INTO [dbo].[Ledger] (EventId) VALUES (@e)", true],
  // The migration runner's own append has to keep working.
  [
    "events-dml-target-prefix",
    "INSERT INTO dbo.Events_SchemaMigrations (MigrationId, AppliedAt) VALUES (@m, @t)",
    false,
  ],
  // A foreign key's ON DELETE clause is not a delete statement. This is the
  // case that requires FROM after DELETE -- migrations/0001 has eight of them.
  [
    "events-dml-target-prefix",
    "CONSTRAINT FK_X FOREIGN KEY (UserId) REFERENCES dbo.Events_Users (Id) ON DELETE NO ACTION",
    false,
  ],
  ["events-dml-target-prefix", "ALTER TABLE dbo.Events_Events ADD Note nvarchar(max) NULL ON DELETE CASCADE", false],
  // MERGE names no target after UPDATE; the lookahead keeps this quiet.
  ["events-dml-target-prefix", "WHEN MATCHED THEN UPDATE SET target.Status = @status", false],
  // Reading is not writing.
  ["events-dml-target-prefix", "SELECT Id FROM dbo.Payroll ORDER BY Id ASC", false],
  // English is not SQL. UPDATE, INSERT INTO and DELETE FROM are all SQL
  // anchors, so ordinary prose in a template literal reaches these rules; only
  // the required statement tail keeps it from being read as a write.
  ["events-dml-target-prefix", "Could not update the event", false],
  ["events-dml-target-prefix", "Could not insert into the list", false],
  ["events-dml-target-prefix", "Could not delete from the board", false],
  ["events-dml-target-prefix", "Nothing to update for this registration", false],
  // events-migration-history-immutable: append yes, change no.
  [
    "events-migration-history-immutable",
    "INSERT INTO dbo.Events_SchemaMigrations (MigrationId, AppliedAt) VALUES (@m, @t)",
    false,
  ],
  ["events-migration-history-immutable", "SELECT MigrationId FROM dbo.Events_SchemaMigrations", false],
  ["events-migration-history-immutable", "DELETE FROM dbo.Events_SchemaMigrations", true],
  ["events-migration-history-immutable", "UPDATE dbo.Events_SchemaMigrations SET AppliedAt = @t", true],
  ["events-migration-history-immutable", "TRUNCATE TABLE dbo.Events_SchemaMigrations", true],
  // The five domain tables a reset does clear are not this rule's business.
  ["events-migration-history-immutable", "DELETE FROM dbo.Events_Registrations", false],
  ["events-migration-history-immutable", "DELETE FROM dbo.Events_Users", false],
];

function selftest(): number {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail?: string) =>
    checks.push({ name, ok, detail });

  // 1. The allowed fixture must be clean.
  const allowed = scanFile(join(ROOT, FIXTURES.allowed));
  add(
    "allowed fixture produces no findings",
    allowed.length === 0,
    allowed.map((f) => `${f.rule.id}@${f.line}`).join(", "),
  );

  // 2. Every rule must be exercised by the rejected fixture. This is what keeps
  //    the fixture honest as rules are added: a new rule with no sample fails.
  const rejected = scanFile(join(ROOT, FIXTURES.rejected));
  const hit = new Set(rejected.map((f) => f.rule.id));
  for (const rule of [...FORBIDDEN, ...DISCOURAGED, ...OWNERSHIP]) {
    add(`rejected fixture exercises rule "${rule.id}"`, hit.has(rule.id));
  }

  // 3. Every finding in the rejected fixture must come from a known rule, and
  //    both classes must be represented.
  add(
    "rejected fixture yields FORBIDDEN findings",
    rejected.some((f) => f.cls === "FORBIDDEN"),
  );
  add(
    "rejected fixture yields DISCOURAGED findings",
    rejected.some((f) => f.cls === "DISCOURAGED"),
  );
  add(
    "rejected fixture yields OWNERSHIP findings",
    rejected.some((f) => f.cls === "OWNERSHIP"),
  );

  // 4. Discrimination: the near-miss cases must not false-positive.
  for (const [id, sample, shouldMatch] of DISCRIMINATION) {
    const rule = [...FORBIDDEN, ...DISCOURAGED, ...OWNERSHIP].find(
      (r) => r.id === id,
    );
    if (!rule) {
      add(`discrimination case names a real rule ("${id}")`, false);
      continue;
    }
    const matched = scanText("<sample>", blankNonCode(sample)).some(
      (f) => f.rule.id === id,
    );
    add(
      `${shouldMatch ? "matches" : "ignores"} [${id}]: ${sample.slice(0, 62)}`,
      matched === shouldMatch,
    );
  }

  // 5. Comments and string literals must not trigger rules.
  add(
    "SQL line comment does not trigger",
    scanText("<c>", blankNonCode("-- never write DROP TABLE IF EXISTS here\nSELECT 1;"))
      .length === 0,
  );
  add(
    "SQL block comment does not trigger",
    scanText("<c>", blankNonCode("/* TRIM( and THROW are banned */ SELECT 1;")).length === 0,
  );
  add(
    "SQL string literal does not trigger",
    scanText("<c>", blankNonCode("RAISERROR(N'do not use THROW or TRIM(', 16, 1);"))
      .length === 0,
  );

  // 6. TypeScript: only SQL-looking template literals are inspected.
  const tsSample = [
    "const message = `Could not update the event`;",
    "if (bad) throw new Error(`no such row`);",
    "const q = `SELECT Id FROM dbo.Events_Users ORDER BY Name`;",
  ].join("\n");
  add(
    "TypeScript: `throw` and ordinary strings are ignored",
    scanText("<ts>", blankNonCode(keepOnlySqlTemplateLiterals(tsSample))).length === 0,
  );
  const tsBad = "const q = `SELECT TRIM(Name) FROM dbo.Events_Users`;";
  add(
    "TypeScript: a forbidden construct inside a SQL literal is caught",
    scanText("<ts>", blankNonCode(keepOnlySqlTemplateLiterals(tsBad))).some(
      (f) => f.rule.id === "trim",
    ),
  );

  // The migration runner authors its DDL as a TypeScript template literal, so
  // the ownership rule has to reach through that path and not only through .sql.
  const tsOwned = "const ddl = `CREATE TABLE dbo.Events_SchemaMigrations (Id int NULL)`;";
  const tsUnowned = "const ddl = `CREATE TABLE dbo.Invoices (Id int NULL)`;";
  const tsUnownedIndex = "const ddl = `DROP INDEX IX_X ON dbo.Invoices`;";
  const ownershipHits = (source: string) =>
    scanText("<ts>", blankNonCode(keepOnlySqlTemplateLiterals(source))).some(
      (f) => f.rule.id === "events-table-prefix",
    );
  add("TypeScript: an Events_ table in a SQL literal passes", !ownershipHits(tsOwned));
  add("TypeScript: a foreign table in a SQL literal is caught", ownershipHits(tsUnowned));
  add(
    "TypeScript: a foreign index target in a SQL literal is caught",
    ownershipHits(tsUnownedIndex),
  );

  // 7. The contract document and this checker must not drift apart.
  const doc = readFileSync(join(ROOT, CONTRACT_DOC), "utf8");
  for (const rule of [...FORBIDDEN, ...DISCOURAGED, ...OWNERSHIP]) {
    add(`${CONTRACT_DOC} documents rule "${rule.id}"`, doc.includes(rule.id));
  }

  // 8. Fixtures must never be inside a normal scan root.
  const scanned = SCAN_ROOTS.flatMap((r) => filesUnder(r.dir, r.extensions)).map((f) =>
    relative(ROOT, f),
  );
  add(
    "fixtures are outside the normal scan roots",
    !scanned.includes(FIXTURES.allowed) && !scanned.includes(FIXTURES.rejected),
  );

  const failed = checks.filter((c) => !c.ok);
  for (const check of checks) {
    if (!check.ok) {
      console.error(`FAIL  ${check.name}${check.detail ? `  (${check.detail})` : ""}`);
    }
  }
  console.log(
    `selftest -- ${checks.length - failed.length}/${checks.length} checks passed ` +
      `(${FORBIDDEN.length} forbidden, ${DISCOURAGED.length} discouraged, ` +
      `${OWNERSHIP.length} ownership rules)`,
  );
  return failed.length === 0 ? 0 : 2;
}

/* --------------------------------------------------------------------- main */

const argument = process.argv[2];
if (argument === "--selftest") {
  process.exit(selftest());
} else if (argument === undefined) {
  process.exit(runScan());
} else {
  console.error(`usage: node scripts/check-tsql-compat.mts [--selftest]`);
  process.exit(2);
}
