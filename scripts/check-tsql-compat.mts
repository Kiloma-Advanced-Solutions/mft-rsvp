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
   * match is a finding: that is how every FORBIDDEN and DISCOURAGED rule works,
   * and `non-table-object-ddl` too, because the object type alone condemns it.
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
    /*
     * `USING` is what makes this a statement rather than a word. T-SQL requires
     * it -- there is no valid MERGE without a source -- so demanding it cannot
     * miss a real one, and it is what separates `MERGE dbo.X AS t USING ...`
     * from "Merge the two drafts into one". The same structural trick the
     * ownership rules use with INSERT_TAIL/UPDATE_TAIL/DELETE_TAIL.
     *
     * Where it stops: a sentence carrying both words within the window -- "we
     * should merge these before using it" -- matches this pattern on its own.
     * What keeps that out is the gate, which does not read a literal as SQL
     * unless a line in it *begins* a statement, and that sentence does not.
     * Neither half is sufficient alone; the pair is.
     */
    pattern: /\bMERGE\b[\s\S]{0,120}?\bUSING\b/i,
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
 * Tables and indexes are the whole of it, and that is correct rather than a
 * gap: every other kind of persisted object is refused outright by
 * `NON_TABLE_OBJECT_DDL` below, prefix or no prefix, so there is no target to
 * read for one.
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
 * DDL against a persisted object that is not a table.
 *
 * **This rule reads no target, and that is the point.** Shared-database rule 11
 * is not "these must be ours" but "these must not exist": *no stored
 * procedures, views, triggers, functions or jobs -- every persisted object is a
 * table we named.* So `CREATE VIEW dbo.Events_Summary` is refused exactly as
 * `CREATE VIEW dbo.PayrollSummary` is, and there is nothing to extract.
 *
 * That is why it is a bare pattern with no `violates` predicate while the
 * three rules below it need one. It is also what keeps this cheap: matching a verb
 * and an object keyword needs no notion of where the name sits, which differs
 * for every one of these -- after the verb for a view, after `ON` for a
 * trigger, and nowhere at all for `CREATE SCHEMA`.
 *
 * Without it, `DDL_TARGET` below covers `TABLE` and `INDEX` and nothing else,
 * so `DROP VIEW dbo.SomeoneElsesView` and `ALTER PROCEDURE
 * dbo.SomeoneElsesProcedure` passed the whole guard silently. A few were caught
 * incidentally -- `create-or-alter` sees `CREATE OR ALTER VIEW`,
 * `drop-if-exists` sees `DROP VIEW IF EXISTS`, `drop-database-or-schema` sees
 * `DROP SCHEMA` and `create-sequence` sees `CREATE SEQUENCE` -- which made the
 * gap look smaller than it was. The plain forms were not covered at all.
 *
 * `LOGIN`, `USER` and `ROLE` are here for the same reason the list is a list:
 * they are server- and database-level objects this application has no business
 * creating, and it holds `db_owner` on a shared organizational database.
 *
 * Not covered, deliberately: `EXEC sp_rename`, `GRANT`/`REVOKE`/`DENY`, and
 * anything reached through dynamic SQL. Naming them would start the slide into
 * the general T-SQL parser this file is explicitly not -- see "What it
 * guarantees, and what it does not" in the contract document.
 *
 * Also not covered, and worth knowing because it is not obvious from the
 * pattern: **the object keyword has to sit immediately after the verb.** Any
 * modifier in between evades this, so `CREATE PARTITION FUNCTION`,
 * `CREATE PARTITION SCHEME`, `CREATE XML SCHEMA COLLECTION` and
 * `CREATE FULLTEXT CATALOG` all pass. Nothing in this project partitions, uses
 * XML schema collections or indexes full text, so they are left out rather than
 * enumerated -- but the list above is the object *keywords* this catches, not
 * every object SQL Server has.
 */
const NON_TABLE_OBJECT_DDL =
  /\b(?:CREATE|ALTER|DROP)\s+(?:VIEW|PROC(?:EDURE)?|FUNCTION|TRIGGER|SCHEMA|SEQUENCE|SYNONYM|TYPE|LOGIN|USER|ROLE)\b/i;

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
 * Objects this application must not touch. Not a compatibility question at all --
 * a third class so the 2008 R2 claim is never diluted by it, and so the report
 * says which kind of mistake was made.
 *
 * The database is a shared organizational one and the development account holds
 * `db_owner`, so nothing on the server side would stop a mistyped
 * `CREATE TABLE Users`. This is what stops it.
 *
 * Two kinds of mistake live here, and they are answered differently:
 *
 *   - a table or index aimed at a name that is not ours -- refused by reading
 *     the target and checking the prefix;
 *   - a view, procedure, function, trigger or other persisted object of any
 *     name -- refused outright, because shared-database rule 11 says this
 *     application owns no such object. Nothing is read from those statements
 *     because an `Events_`-prefixed one is no better.
 */
const OWNERSHIP: Rule[] = [
  {
    id: "non-table-object-ddl",
    pattern: NON_TABLE_OBJECT_DDL,
    instead: `nothing -- shared-database rule 11: the only persisted object this application owns is a table it named. A dbo.${OWNED_PREFIX}Thing view or procedure is refused too, which is why this rule reads no target`,
  },
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
 * What makes a template literal T-SQL: **a line that begins a statement.**
 *
 * This decides which template literals in a `.ts`/`.mts` file are scanned at
 * all, so a gap here silently disables every rule below it. It used to ask a
 * different question -- "does this contain one of these SQL-ish words?" -- with
 * a list built from the clauses our own statements happened to use. That list
 * was independent of the rule set, and the two drifted: a literal holding only
 * `THROW`, `MERGE`, `CREATE SEQUENCE`, `ALTER DATABASE` or `DROP SCHEMA`
 * matched no clause word, was discarded before any rule ran, and passed. The
 * rules were all present and correct; they were never handed the text.
 *
 * Asking about *statement shape* instead is what closes that. A statement
 * verb at the start of a line is the one thing every construct these rules
 * reject has in common -- they are statements -- so the gate no longer has to
 * enumerate anything the rules already know about.
 *
 * Erring wide is deliberate and cheap. Letting a non-SQL literal through costs
 * nothing unless a rule then matches it, and the self-test keeps a corpus of
 * ordinary strings to prove that does not happen. Letting SQL out is the bug
 * this had.
 *
 * **Nothing further is required of the literal, and that is load-bearing.** An
 * earlier attempt also demanded a `dbo.`, an `@parameter` or a `;` before a
 * literal counted, to stop English sentences beginning with a statement verb.
 * It worked, and it silently dropped every statement written without schema
 * qualification or a terminator -- `INSERT INTO Invoices (Id) VALUES (1)` and
 * `CREATE TABLE Invoices (Id int NULL)` among them, which is the ownership rule
 * the shared database depends on. Telling SQL from prose is a rule's job, not
 * the gate's: `INSERT_TAIL`, `UPDATE_TAIL` and `DELETE_TAIL` already do it for
 * the ownership rules, and the `merge` rule does it by requiring the `USING`
 * that T-SQL requires too.
 *
 * The limit worth knowing: a *fragment* is not a statement, so a literal
 * holding only `WHERE Id = @id` is not scanned. Fragments in this project are
 * interpolated into a statement that is -- keep it that way, and do not hide a
 * construct in one.
 */
const SQL_STATEMENT =
  /(?:^|\n)[ \t]*(?:SELECT|INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DENY|EXEC|EXECUTE|SET|DECLARE|BEGIN|COMMIT|ROLLBACK|IF|WHILE|THROW|RAISERROR|PRINT|USE|BACKUP|RESTORE|WITH|GO)\b/i;

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

/** Blanks everything that is not inside a template literal that begins a statement. */
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
      if (SQL_STATEMENT.test(body)) {
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
      `application must not touch).`,
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
  // non-table-object-ddl: the prefix is irrelevant -- these objects may not
  // exist at all, so `Events_`-prefixed samples must match just as foreign ones
  // do. That asymmetry against every other ownership rule is the rule.
  ["non-table-object-ddl", "CREATE VIEW dbo.PayrollSummary AS SELECT 1 AS One", true],
  ["non-table-object-ddl", "CREATE VIEW dbo.Events_Summary AS SELECT 1 AS One", true],
  ["non-table-object-ddl", "ALTER VIEW dbo.Events_Summary AS SELECT 2 AS Two", true],
  ["non-table-object-ddl", "DROP VIEW dbo.SomeoneElsesView", true],
  ["non-table-object-ddl", "CREATE PROCEDURE dbo.Payroll_Pay AS SELECT 1", true],
  ["non-table-object-ddl", "ALTER PROCEDURE dbo.SomeoneElsesProcedure AS SELECT 1", true],
  ["non-table-object-ddl", "DROP PROC dbo.Payroll_Pay", true],
  ["non-table-object-ddl", "CREATE FUNCTION dbo.Events_Rate () RETURNS int AS BEGIN RETURN 1 END", true],
  ["non-table-object-ddl", "DROP FUNCTION dbo.Payroll_Rate", true],
  ["non-table-object-ddl", "CREATE TRIGGER TR_X ON dbo.Events_Events AFTER INSERT AS SELECT 1", true],
  ["non-table-object-ddl", "DROP TRIGGER dbo.TR_Payroll", true],
  ["non-table-object-ddl", "CREATE SCHEMA finance", true],
  ["non-table-object-ddl", "DROP SEQUENCE dbo.PayrollSeq", true],
  ["non-table-object-ddl", "CREATE SYNONYM dbo.Payroll2 FOR dbo.Payroll", true],
  ["non-table-object-ddl", "CREATE TYPE dbo.MoneyList AS TABLE (Amount int)", true],
  /*
   * The false-positive boundary, pinned rather than papered over.
   *
   * This rule is a bare verb-plus-noun pattern -- it has no `USING`, no `SET`,
   * no `FROM` to demand, because the object type alone condemns the statement.
   * The cost is that an English sentence *beginning* with the same two words is
   * indistinguishable to it, and `SQL_STATEMENT` cannot help: a line starting
   * `Create` is exactly what the gate is looking for.
   *
   * So these are recorded as matches, which is what they are. They are not
   * approval -- they are the limitation made visible and testable. Mid-sentence
   * prose, which is how this repository actually writes, stays clean and is
   * covered in `ORDINARY_TEMPLATES` below.
   *
   * Narrowing the rule to exclude them was considered and rejected: nothing
   * cheap separates `CREATE USER app_reader` from `Create user rows first`, and
   * a heuristic that tried would weaken detection of the real DDL this rule
   * exists to catch. If a line-initial phrase like these ever does fail the
   * check, reword the message -- do not loosen the rule.
   */
  ["non-table-object-ddl", "Create user fixtures before events", true],
  ["non-table-object-ddl", "Drop schema-level objects by hand", true],
  ["non-table-object-ddl", "Alter type of the capacity column", true],
  ["non-table-object-ddl", "Create role assignments are out of scope", true],
  ["non-table-object-ddl", "Drop user data older than a year?", true],
  // And what it must leave alone: table DDL is the other rules' business, and
  // a column called `Type` or a table called `Procedures` is not DDL at all.
  ["non-table-object-ddl", "CREATE TABLE dbo.Events_Users (Id uniqueidentifier NOT NULL)", false],
  ["non-table-object-ddl", "DROP TABLE dbo.Events_Users", false],
  ["non-table-object-ddl", "CREATE UNIQUE NONCLUSTERED INDEX IX_A ON dbo.Events_Users (Id)", false],
  ["non-table-object-ddl", "ALTER TABLE dbo.Events_Events ADD Kind nvarchar(16) NULL", false],
  ["non-table-object-ddl", "SELECT Id FROM dbo.Events_Users ORDER BY Id ASC", false],
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
  // The `merge` rule tells a statement from a sentence on its own, by requiring
  // the `USING` that T-SQL requires -- the gate asks literals for no
  // corroborating punctuation, so the rule cannot lean on any.
  ["merge", "MERGE dbo.Events_Users AS t USING dbo.Events_Events AS s ON t.Id = s.Id", true],
  ["merge", "MERGE INTO dbo.Events_Users AS t\nUSING (SELECT 1 AS One) AS s ON 1 = 1", true],
  ["merge", "Merge the two drafts into one", false],
  ["merge", "Merge conflict in lib/data/seed.mts", false],

  // English is not SQL. A line beginning UPDATE, INSERT INTO or DELETE FROM is
  // read as a statement, so ordinary prose in a template literal does reach
  // these rules; only the required statement tail keeps it from being taken for
  // a write.
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

  /*
   * Every statement the rejected fixture holds must also be caught when it is
   * embedded in a TypeScript template literal, one statement at a time.
   *
   * This is the check that would have caught the gap this test was written for.
   * The old gate kept a literal only if it contained one of a hand-written list
   * of clause words, and that list was maintained independently of the rules --
   * so `THROW`, `MERGE`, `CREATE SEQUENCE`, `ALTER DATABASE` and `DROP SCHEMA`
   * were discarded before any rule saw them, while the `.sql` fixtures (which
   * never pass through the gate) kept reporting a clean 154/154.
   *
   * Deriving the samples from the fixture rather than listing them here is the
   * point: a rule added with a fixture sample is covered on the TypeScript path
   * automatically, and a rule whose construct cannot survive the gate fails
   * here rather than passing silently.
   */
  const fixtureSource = readFileSync(join(ROOT, FIXTURES.rejected), "utf8");
  const asTemplate = (chunk: string) =>
    `const q = \`${chunk.replace(/[`\\]/g, "\\$&").replace(/\$\{/g, "\\${")}\`;`;

  let statementsChecked = 0;
  for (const chunk of fixtureSource.split(/\n\s*\n/)) {
    const viaSql = new Set(
      scanText("<sql>", blankNonCode(chunk)).map((f) => f.rule.id),
    );
    if (viaSql.size === 0) continue;

    statementsChecked += 1;
    const viaTs = new Set(
      scanText(
        "<ts>",
        blankNonCode(keepOnlySqlTemplateLiterals(asTemplate(chunk))),
      ).map((f) => f.rule.id),
    );
    const missed = [...viaSql].filter((id) => !viaTs.has(id));
    add(
      `TypeScript path catches [${[...viaSql].join(", ")}] as it does in .sql`,
      missed.length === 0,
      missed.length > 0 ? `missed: ${missed.join(", ")}` : undefined,
    );
  }
  add(
    "fixture-derived TypeScript parity covered every rejected statement",
    statementsChecked > 0,
    `${statementsChecked} statement group(s)`,
  );

  /*
   * SQL with no `dbo.`, no bound parameter and no terminator, reached through
   * the TypeScript path.
   *
   * The fixture-derived loop above cannot cover this: every statement-bearing
   * chunk in `forbidden.sql` happens to carry at least one of those three, so a
   * gate that demanded one would keep passing it. A gate that demanded one is
   * exactly the mistake this file made once -- it dropped all seven of the
   * samples below, including both ownership rules, while the suite still
   * reported green.
   *
   * So these are written out rather than derived, and written token-less on
   * purpose. Each is a single template literal in a `.ts` source, so the only
   * way it reaches a rule is through `keepOnlySqlTemplateLiterals` -- if that
   * ever narrows again, these fail first.
   */
  const TOKENLESS_TEMPLATES: Array<[string, string]> = [
    ["trim", "const q = `SELECT TRIM(Name) FROM Events_Users`;"],
    ["concat", "const q = `SELECT CONCAT(a, b) FROM Events_Users`;"],
    ["drop-if-exists", "const q = `DROP TABLE IF EXISTS Events_Example`;"],
    [
      "offset-rows",
      "const q = `SELECT Id FROM Events_Users ORDER BY Name OFFSET 10 ROWS`;",
    ],
    ["truncate", "const q = `TRUNCATE TABLE Events_Users`;"],
    [
      "events-dml-target-prefix",
      "const q = `INSERT INTO Invoices (Id) VALUES (1)`;",
    ],
    ["events-table-prefix", "const q = `CREATE TABLE Invoices (Id int NULL)`;"],
    ["throw", "const q = `THROW 50000, 1, 1`;"],
    [
      "merge",
      "const q = `MERGE Events_Users AS t USING Events_Events AS s ON t.Id = s.Id`;",
    ],
    ["create-sequence", "const q = `CREATE SEQUENCE Events_Thing_Seq AS int`;"],
    ["alter-database", "const q = `ALTER DATABASE CURRENT SET ONLINE`;"],
    ["drop-database-or-schema", "const q = `DROP SCHEMA reporting`;"],
  ];
  for (const [id, source] of TOKENLESS_TEMPLATES) {
    const hits = scanText(
      "<ts>",
      blankNonCode(keepOnlySqlTemplateLiterals(source)),
    ).map((f) => f.rule.id);
    add(
      `token-less TypeScript literal is still read as SQL [${id}]`,
      hits.includes(id),
      hits.length === 0 ? "the literal never reached any rule" : hits.join(", "),
    );
  }

  /*
   * And the other half of the bargain: erring wide must not make the checker
   * noisy. These are the shapes ordinary application code writes -- English
   * sentences that happen to contain SQL-ish words, and JavaScript whose method
   * names collide with T-SQL function names.
   */
  const ORDINARY_TEMPLATES = [
    "const a = `Could not update the event. Select another date and try again.`;",
    "const b = `${user.name.trim()} joined`;",
    "const c = `${format(date)} — ${concat(parts)}`;",
    "const d = `/api/events/${id}/registrations`;",
    "const e = `grid-template-columns: repeat(${n}, 1fr)`;",
    "const f = `Delete from your calendar?`;",
    "const g = `Merge the two drafts into one`;",
    "const h = `${count} people are going`;",
    /*
     * The vocabulary `non-table-object-ddl` introduced -- `create user`,
     * `drop schema`, `alter type`, `create role`, `drop user`. That rule is a
     * bare verb-plus-noun pattern with no structural requirement, unlike the
     * TAIL-guarded write rules above, so it is the one most able to read
     * English as DDL. These pin the half of the boundary that is safe: prose
     * where the phrase falls **mid-sentence**, which is how this repository's
     * messages read. What keeps them quiet is `SQL_STATEMENT` -- no line begins
     * with a statement verb, so the literal is never handed to a rule at all.
     * If that gate is ever widened, these are what fail first.
     *
     * The other half of the boundary -- the same phrase at the *start* of a
     * line -- does match, and is pinned as such in `DISCRIMINATION` above
     * rather than pretended away here.
     */
    "const i = `Could not create user ${name}`;",
    "const j = `Refusing to create user rows on a non-empty schema`;",
    "const k = `This command will not create role or drop user records.`;",
    "const l = `Nothing here will alter type or drop schema objects`;",
    "const m = `Please drop view of the old dashboard`;",
  ];
  for (const sample of ORDINARY_TEMPLATES) {
    const hits = scanText(
      "<ts>",
      blankNonCode(keepOnlySqlTemplateLiterals(sample)),
    );
    add(
      `ordinary template is not read as SQL: ${sample.slice(10, 58)}`,
      hits.length === 0,
      hits.map((f) => f.rule.id).join(", "),
    );
  }

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
