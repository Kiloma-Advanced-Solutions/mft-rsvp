/**
 * The application log: technical and operational events, one line each, on
 * stdout and stderr. SERVER ONLY.
 *
 * PM2 collects the process's stdout and stderr, so writing a line is the whole
 * of the transport -- there are no files, rotation or shipping here, and there
 * should not be. `debug` and `info` go to stdout; `warn` and `error` go to
 * stderr, which is PM2's error log.
 *
 * What belongs here is what broke and what the system is doing: an unexpected
 * error, a pool failure, a mail service refusing, startup. What does **not**
 * belong here is who did what -- a successful registration, an expected 409.
 * That is the audit log's (`Events_AuditLog`), and repeating it here would
 * give the same fact two homes.
 *
 * Two formats, chosen by `LOG_FORMAT`:
 *
 *   - `json`   -- one JSON object per line, for PM2 and `jq`. The default when
 *                 `NODE_ENV=production`.
 *   - `pretty` -- one readable line, plus the stack on the lines after it. The
 *                 default otherwise.
 *
 * `LOG_LEVEL` is `debug`, `info` (default), `warn` or `error`.
 *
 * PRIVACY. A field reaches the output only if it is named in `LogFields`, and
 * that is checked at run time as well as by the compiler, so a cast cannot
 * smuggle a request body in. Every string -- field values, error messages,
 * stacks -- passes through the redactor `lib/data/client.ts` registers, which
 * masks the database credentials and host wherever they appear. Names, emails,
 * headers, cookies, bodies and event content have no field to go in.
 *
 * It never throws. A logger that threw would take out the error handling it
 * exists to serve.
 *
 * Built in rather than a dependency: the volume is low, the output is a line,
 * and an allowlist is a stronger privacy guarantee than a library's list of
 * paths to hide. The call surface -- `log.error(event, fields)` -- is what a
 * library like Pino would offer, should that ever be worth the dependency.
 */

// With its extension, unlike the rest of `lib/`: `scripts/check-logging.mts`
// imports this module under bare Node, which resolves only exact file names.
import { currentRequestContext } from "./requestContext.ts";

const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export type LogFormat = "json" | "pretty";

/** `domain.action`, for example `db.pool_error`. */
export type LogEvent = `${string}.${string}`;

/**
 * Everything a log line may carry beyond its timestamp, level, event and
 * process id. Adding a field is a deliberate change to this type and to
 * `FIELD_KINDS` below.
 */
export type LogFields = {
  /** Taken from the request context when not given. */
  requestId?: string;
  /** The part of the system that is reporting: `api`, `db`, `mail`, ... */
  component?: string;
  /** A route pattern such as `/api/events/:id` -- never a raw URL. */
  route?: string;
  method?: string;
  /** An audit operation name, when the event concerns one. */
  op?: string;
  status?: number;
  durationMs?: number;
  /** A machine-readable code, never a sentence. */
  reason?: string;
  /** An audit outcome (`success`, `rejected`, ...), when a line concerns an audit write. */
  outcome?: string;
  /** How many attempts an operation made -- the audit writer's inserts. */
  attempts?: number;
  /** True when an operation may or may not have taken effect: a write that timed out. */
  ambiguous?: boolean;
  err?: unknown;
};

/** The run-time half of the allowlist: every field, and the kind it must be. */
const FIELD_KINDS = {
  requestId: "string",
  component: "string",
  route: "string",
  method: "string",
  op: "string",
  status: "number",
  durationMs: "number",
  reason: "string",
  outcome: "string",
  attempts: "number",
  ambiguous: "boolean",
  err: "error",
} as const satisfies Record<keyof LogFields, "string" | "number" | "boolean" | "error">;

const FIELD_NAMES = Object.keys(FIELD_KINDS) as Array<keyof LogFields>;

/** Long enough to diagnose from; short enough that nothing is echoed whole. */
const MAX_STRING_LENGTH = 500;
const MAX_STACK_LENGTH = 4000;
/** An error's `cause`, and that cause's, and no further. */
const MAX_CAUSE_DEPTH = 2;

type SerializedError = {
  name: string;
  message: string;
  code?: string;
  /** The SQL Server error number, when the driver supplied one. */
  number?: number;
  stack?: string;
  cause?: SerializedError;
};

export type Logger = Record<
  LogLevel,
  (event: LogEvent, fields?: LogFields) => void
>;

export type LoggerOptions = {
  level: LogLevel;
  format: LogFormat;
  /** Writes one complete line, newline included, to the given stream. */
  write: (stream: "stdout" | "stderr", line: string) => void;
  redact: (text: string) => string;
  /** The current request's id, used when a call does not pass one. */
  requestId?: () => string | undefined;
  now?: () => Date;
  pid?: number;
};

const LEVEL_RANK: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * The parts of an error worth keeping, redacted and bounded.
 *
 * `mssql` puts the SQL Server error number on the error it throws and the
 * underlying tedious error under `originalError`, which is where the number
 * sometimes ends up instead -- the same two places `lib/data/errors.ts` reads.
 */
export function serializeError(
  value: unknown,
  redact: (text: string) => string,
  depth = 0,
): SerializedError {
  if (!isRecord(value)) {
    return {
      name: "NonError",
      message: truncate(redact(String(value)), MAX_STRING_LENGTH),
    };
  }

  const name = typeof value.name === "string" ? value.name : "Error";
  const message = typeof value.message === "string" ? value.message : "";
  const original = isRecord(value.originalError) ? value.originalError : undefined;
  const number =
    typeof value.number === "number"
      ? value.number
      : typeof original?.number === "number"
        ? original.number
        : undefined;

  const result: SerializedError = {
    name: truncate(redact(name), MAX_STRING_LENGTH),
    message: truncate(redact(message), MAX_STRING_LENGTH),
  };
  if (typeof value.code === "string") {
    result.code = truncate(redact(value.code), MAX_STRING_LENGTH);
  }
  if (number !== undefined) result.number = number;
  if (typeof value.stack === "string") {
    result.stack = truncate(redact(value.stack), MAX_STACK_LENGTH);
  }
  if (value.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    result.cause = serializeError(value.cause, redact, depth + 1);
  }
  return result;
}

const ERROR_NAME = /^[A-Za-z][A-Za-z0-9]{0,63}$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

/**
 * An error reduced to its kind and code -- `TypeError`, `ECONNREFUSED` --
 * with no message, stack or cause, for an error whose text may carry a secret
 * the redactor does not know about. `fetch`, for one, quotes the whole URL it
 * was given, credentials included, and its cause names the host and port.
 *
 * The code is the error's own or its cause's, and is kept only when it looks
 * like a code; a name that does not look like one becomes `Error`. Pass the
 * result as `err`.
 */
export function errorKind(value: unknown): { name: string; code?: string } {
  if (!isRecord(value)) return { name: "NonError" };
  const name = typeof value.name === "string" && ERROR_NAME.test(value.name) ? value.name : "Error";
  const cause = isRecord(value.cause) ? value.cause : undefined;
  const code = [value.code, cause?.code].find(
    (candidate): candidate is string => typeof candidate === "string" && ERROR_CODE.test(candidate),
  );
  return code === undefined ? { name } : { name, code };
}

/** Only allowlisted fields, each of the right kind, strings redacted. */
function sanitizeFields(
  fields: LogFields,
  redact: (text: string) => string,
): Record<string, string | number | boolean | SerializedError> {
  const safe: Record<string, string | number | boolean | SerializedError> = {};
  for (const name of FIELD_NAMES) {
    const value: unknown = fields[name];
    if (value === undefined) continue;
    switch (FIELD_KINDS[name]) {
      case "string":
        if (typeof value === "string") {
          safe[name] = truncate(redact(value), MAX_STRING_LENGTH);
        }
        break;
      case "number":
        if (typeof value === "number" && Number.isFinite(value)) {
          safe[name] = value;
        }
        break;
      case "boolean":
        if (typeof value === "boolean") safe[name] = value;
        break;
      case "error":
        safe[name] = serializeError(value, redact);
        break;
    }
  }
  return safe;
}

/**
 * Keeps text that came from an error on the line it is printed on. A message
 * with a newline in it would otherwise start an unindented line that reads
 * like a separate log entry. (Field values are already quoted with
 * `JSON.stringify`, which escapes them the same way.)
 */
function oneLine(text: string): string {
  return text.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
}

/** A V8 stack frame: `    at fn (file:line:col)`. */
const STACK_FRAME = /^\s+at /;

/**
 * The stack without its header. V8 starts a stack with `name: message`, which
 * spans as many lines as the message does, and the first line already prints
 * that message -- so the frames start at the first `at` line. A stack with no
 * such line (not one V8 wrote) drops the header's line count instead.
 */
function stackFrames(error: SerializedError): string[] {
  const lines = error.stack?.split("\n") ?? [];
  const firstFrame = lines.findIndex((line) => STACK_FRAME.test(line));
  const headerLines = `${error.name}: ${error.message}`.split("\n").length;
  return lines.slice(firstFrame === -1 ? headerLines : firstFrame);
}

function prettyLine(
  timestamp: string,
  level: LogLevel,
  event: string,
  fields: Record<string, string | number | boolean | SerializedError>,
): string {
  const parts = [timestamp.slice(11, 23), level.toUpperCase().padEnd(5), oneLine(event)];
  let error: SerializedError | undefined;
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === "object") {
      error = value;
      continue;
    }
    parts.push(`${name}=${typeof value === "string" ? JSON.stringify(value) : value}`);
  }
  if (error === undefined) return parts.join(" ");

  parts.push(`err=${oneLine(error.name)}: ${oneLine(error.message)}`);
  const lines = [parts.join(" ")];
  for (const frame of stackFrames(error)) lines.push(`    ${oneLine(frame.trim())}`);
  for (let cause = error.cause; cause; cause = cause.cause) {
    lines.push(`    caused by ${oneLine(cause.name)}: ${oneLine(cause.message)}`);
  }
  return lines.join("\n");
}

export function createLogger(options: LoggerOptions): Logger {
  const now = options.now ?? (() => new Date());
  const pid = options.pid ?? process.pid;

  const emit = (level: LogLevel, event: LogEvent, fields: LogFields = {}) => {
    try {
      if (LEVEL_RANK[level] < LEVEL_RANK[options.level]) return;

      const safe = sanitizeFields(
        { ...fields, requestId: fields.requestId ?? options.requestId?.() },
        options.redact,
      );
      // Event names are constants in code, but the type admits any
      // `domain.action` string, so it gets the same treatment as a field.
      const safeEvent = truncate(options.redact(event), MAX_STRING_LENGTH);
      const timestamp = now().toISOString();
      const line =
        options.format === "json"
          ? JSON.stringify({ ts: timestamp, level, event: safeEvent, pid, ...safe })
          : prettyLine(timestamp, level, safeEvent, safe);

      options.write(level === "debug" || level === "info" ? "stdout" : "stderr", `${line}\n`);
    } catch {
      // The line could not be built or written. Say so without any of the
      // input, which is the thing that might have caused it.
      try {
        options.write("stderr", `${JSON.stringify({ level: "error", event: "log.failed", pid })}\n`);
      } catch {
        // Nothing left to report through.
      }
    }
  };

  return {
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
  };
}

/** `LOG_LEVEL` and `LOG_FORMAT`, with the defaults the header describes. */
export function readLogConfig(env: Record<string, string | undefined>): {
  level: LogLevel;
  format: LogFormat;
} {
  const rawLevel = env.LOG_LEVEL?.trim().toLowerCase();
  const level = LOG_LEVELS.find((candidate) => candidate === rawLevel) ?? "info";

  const rawFormat = env.LOG_FORMAT?.trim().toLowerCase();
  const format: LogFormat =
    rawFormat === "json" || rawFormat === "pretty"
      ? rawFormat
      : env.NODE_ENV === "production"
        ? "json"
        : "pretty";

  return { level, format };
}

/* ------------------------------------------------------- the shared logger */

/**
 * The installed redactor lives on `globalThis`, not in a module variable.
 *
 * Next can compile this module into more than one bundle -- `instrumentation.ts`
 * is built apart from the routes and pages -- and each copy would have its own
 * module variable. Only the copy `lib/data/client.ts` happens to share would
 * then be masked. `globalThis` is one object per server process, so whichever
 * copy installs the redactor, every copy in the process uses it: the same
 * reasoning that keeps the connection pool there. It does not reach another
 * process, and does not need to: each process loads `client.ts` before it can
 * produce a database error worth masking.
 */
const globalForLog = globalThis as typeof globalThis & {
  __eventsBoardLogRedactor?: (text: string) => string;
};

/**
 * Installs the function that masks secrets in every line. Called by
 * `lib/data/client.ts`, the one module that reads the connection string, so
 * the secret and the code that hides it stay in the same place.
 */
export function setLogRedactor(redact: (text: string) => string): void {
  globalForLog.__eventsBoardLogRedactor = redact;
}

function installedRedactor(text: string): string {
  const redact = globalForLog.__eventsBoardLogRedactor;
  return redact === undefined ? text : redact(text);
}

let shared: Logger | undefined;

function sharedLogger(): Logger {
  if (shared === undefined) {
    shared = createLogger({
      ...readLogConfig(process.env),
      write: (stream, line) => {
        (stream === "stdout" ? process.stdout : process.stderr).write(line);
      },
      // Looked up on every line, so a redactor installed after the first line
      // still applies to every line after it.
      redact: installedRedactor,
      requestId: () => currentRequestContext().requestId,
    });
  }
  return shared;
}

/** The application's logger. Configuration is read on first use. */
export const log: Logger = {
  debug: (event, fields) => sharedLogger().debug(event, fields),
  info: (event, fields) => sharedLogger().info(event, fields),
  warn: (event, fields) => sharedLogger().warn(event, fields),
  error: (event, fields) => sharedLogger().error(event, fields),
};
