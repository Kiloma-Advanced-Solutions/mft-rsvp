/**
 * Proves the application log and the request context do what M12 relies on.
 *
 *   npm run check:logging
 *
 * Covers what can be checked without a server or a database:
 *
 *   1. the logger -- JSON and pretty output, levels, which stream each level
 *      goes to, the field allowlist (enforced at run time, not only by types),
 *      error serialisation, redaction, length bounds, and that it never throws;
 *   2. the configuration read from `LOG_LEVEL` / `LOG_FORMAT`;
 *   3. request ids -- a client-supplied value that is not a UUID is replaced;
 *   4. the route-handler request context -- concurrent requests never see each
 *      other's id or actor, and nothing survives the request.
 *
 * What it cannot check is the page-render half of the request context, which
 * depends on React scoping `cache()` to a server render. That only exists
 * inside a running Next server, so it is verified there.
 *
 * **Every value here is synthetic.** No real credential, host or person.
 *
 * Node built-ins and the modules under test only, so it runs with bare `node`.
 */

import { createRedactor } from "../lib/data/redact.mts";
import {
  createLogger,
  log,
  readLogConfig,
  serializeError,
  setLogRedactor,
  type LogFields,
  type LoggerOptions,
} from "../lib/log.ts";
import {
  currentRequestContext,
  noteActor,
  runWithRequestContext,
} from "../lib/requestContext.ts";
import { isRequestId, REQUEST_ID_HEADER, requestIdFrom } from "../lib/requestId.ts";

type Check = { name: string; ok: boolean; detail?: string };

const checks: Check[] = [];

function add(name: string, ok: boolean, detail?: string): void {
  checks.push({ name, ok, detail });
}

const SECRET = "SyntheticPw1";
const HOST = "h.example.net";
const CONNECTION_STRING = `Server=${HOST},1433;Database=d;User Id=u;Password=${SECRET}`;
const redact = createRedactor(CONNECTION_STRING);

type Line = { stream: "stdout" | "stderr"; text: string };

/** A logger whose output is captured instead of written. */
function capture(overrides: Partial<LoggerOptions> = {}) {
  const lines: Line[] = [];
  const logger = createLogger({
    level: "debug",
    format: "json",
    write: (stream, text) => lines.push({ stream, text }),
    redact,
    now: () => new Date("2026-01-02T03:04:05.678Z"),
    pid: 4242,
    ...overrides,
  });
  return { logger, lines };
}

function parse(line: Line | undefined): Record<string, unknown> | undefined {
  if (line === undefined) return undefined;
  try {
    return JSON.parse(line.text) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/* ------------------------------------------------------- 1a. JSON output */

{
  const { logger, lines } = capture();
  logger.error("db.pool_error", {
    component: "db",
    route: "/api/events/[id]",
    status: 500,
    durationMs: 12,
    requestId: "0f8e7c1a-1111-4222-8333-444455556666",
  });
  const only = lines[0];
  const parsed = parse(only);

  add("json: one line per call", lines.length === 1);
  add("json: line ends with a single newline", only?.text.endsWith("}\n") === true && only.text.split("\n").length === 2);
  add("json: line parses as JSON", parsed !== undefined, only?.text);
  add(
    "json: carries ts, level, event, pid",
    parsed?.ts === "2026-01-02T03:04:05.678Z" &&
      parsed.level === "error" &&
      parsed.event === "db.pool_error" &&
      parsed.pid === 4242,
    only?.text,
  );
  add(
    "json: carries the given fields",
    parsed?.component === "db" &&
      parsed.route === "/api/events/[id]" &&
      parsed.status === 500 &&
      parsed.durationMs === 12 &&
      parsed.requestId === "0f8e7c1a-1111-4222-8333-444455556666",
    only?.text,
  );
}

/* ---------------------------------------------- 1b. levels and streams */

{
  const { logger, lines } = capture();
  logger.debug("a.debug");
  logger.info("a.info");
  logger.warn("a.warn");
  logger.error("a.error");
  add(
    "streams: debug and info go to stdout, warn and error to stderr",
    lines.map((line) => line.stream).join(",") === "stdout,stdout,stderr,stderr",
    lines.map((line) => line.stream).join(","),
  );
}

{
  const { logger, lines } = capture({ level: "warn" });
  logger.debug("a.debug");
  logger.info("a.info");
  logger.warn("a.warn");
  logger.error("a.error");
  add(
    "levels: warn drops debug and info, keeps warn and error",
    lines.map((line) => parse(line)?.event).join(",") === "a.warn,a.error",
    lines.map((line) => parse(line)?.event).join(","),
  );
}

{
  const { logger, lines } = capture({ level: "error" });
  logger.warn("a.warn");
  logger.error("a.error");
  add("levels: error keeps only error", lines.length === 1 && parse(lines[0])?.event === "a.error");
}

/* --------------------------------------------------- 1c. the allowlist */

{
  const { logger, lines } = capture();
  // The cast is the point: a caller who gets past the type must still be stopped.
  logger.info("a.leak", {
    component: "api",
    email: "someone@example.com",
    name: "Synthetic Person",
    body: { message: "private" },
    headers: { cookie: "eb_persona=x" },
  } as unknown as LogFields);
  const parsed = parse(lines[0]);
  const keys = parsed ? Object.keys(parsed).sort().join(",") : "";
  add("allowlist: unknown fields are dropped at run time", keys === "component,event,level,pid,ts", keys);
  add(
    "allowlist: no trace of the dropped values",
    !/someone@example\.com|Synthetic Person|private|eb_persona/.test(lines[0]?.text ?? ""),
  );
}

{
  const { logger, lines } = capture();
  logger.info("a.kinds", {
    status: "500",
    durationMs: Number.NaN,
    component: 7,
    reason: "full",
  } as unknown as LogFields);
  const parsed = parse(lines[0]);
  add(
    "allowlist: a field of the wrong kind is dropped",
    parsed !== undefined &&
      !("status" in parsed) &&
      !("durationMs" in parsed) &&
      !("component" in parsed) &&
      parsed.reason === "full",
    lines[0]?.text,
  );
}

/* --------------------------------------------- 1d. errors and redaction */

{
  const driverError = Object.assign(
    new Error(`Login failed for user 'u' on ${HOST}:1433 using password ${SECRET}`),
    { name: "ConnectionError", code: "ELOGIN", originalError: { number: 18456 } },
  );
  const { logger, lines } = capture();
  logger.error("db.pool_error", { err: driverError, reason: `retry ${SECRET}` });
  const text = lines[0]?.text ?? "";
  const err = parse(lines[0])?.err as Record<string, unknown> | undefined;

  add("redaction: the password never appears", !text.includes(SECRET), text);
  add("redaction: the host never appears", !text.includes(HOST), text);
  add("redaction: string fields are masked too", parse(lines[0])?.reason === "retry ***", text);
  add(
    "errors: name, code and message are kept",
    err?.name === "ConnectionError" &&
      err.code === "ELOGIN" &&
      typeof err.message === "string" &&
      err.message.startsWith("Login failed for user 'u' on ***"),
    JSON.stringify(err),
  );
  add("errors: the SQL error number is read from originalError", err?.number === 18456, JSON.stringify(err));
  add("errors: the stack is kept, redacted", typeof err?.stack === "string" && !String(err.stack).includes(SECRET));
}

{
  const serialized = serializeError({ name: "RequestError", message: "deadlock", number: 1205 }, redact);
  add("errors: a number on the error itself is read", serialized.number === 1205);
}

{
  const deep = new Error("one", { cause: new Error("two", { cause: new Error("three", { cause: new Error("four") }) }) });
  const serialized = serializeError(deep, redact);
  add(
    "errors: causes are followed two levels and no further",
    serialized.cause?.message === "two" &&
      serialized.cause.cause?.message === "three" &&
      serialized.cause.cause.cause === undefined,
  );
}

{
  const serialized = serializeError(`thrown string with ${SECRET}`, redact);
  add(
    "errors: a non-Error value is reported, redacted",
    serialized.name === "NonError" && serialized.message === "thrown string with ***",
    JSON.stringify(serialized),
  );
}

{
  const { logger, lines } = capture();
  logger.info("a.long", { reason: "x".repeat(5000) });
  const reason = parse(lines[0])?.reason;
  add("bounds: a long string is truncated", typeof reason === "string" && reason.length <= 501, String(reason).length.toString());
}

/* ------------------------------------------------- 1e. it never throws */

{
  let threw = false;
  try {
    const logger = createLogger({
      level: "debug",
      format: "json",
      write: () => {
        throw new Error("stdout closed");
      },
      redact,
    });
    logger.error("a.unwritable", { err: new Error("x") });
  } catch {
    threw = true;
  }
  add("never throws: a failing write is swallowed", !threw);
}

{
  const { logger, lines } = capture({
    redact: () => {
      throw new Error("redactor bug");
    },
  });
  let threw = false;
  try {
    logger.error("a.redactor_fails", { reason: "x" });
  } catch {
    threw = true;
  }
  const parsed = parse(lines[0]);
  add(
    "never throws: a failing redactor writes a bare log.failed line instead",
    !threw && parsed?.event === "log.failed" && !lines[0]?.text.includes("a.redactor_fails"),
    lines[0]?.text,
  );
}

{
  const circular: Record<string, unknown> = { name: "Weird", message: "loop" };
  circular.cause = circular;
  const hostile = {
    get message(): string {
      throw new Error("getter");
    },
  };
  const { logger, lines } = capture();
  let threw = false;
  try {
    logger.error("a.circular", { err: circular });
    logger.error("a.hostile", { err: hostile });
  } catch {
    threw = true;
  }
  add("never throws: circular and throwing-getter errors", !threw && lines.length === 2, lines.map((line) => line.text).join(""));
}

{
  // `JSON.stringify` throws on a BigInt, so one must never reach it -- not as a
  // number field, and not as an error's `number` or `code`. The line is still
  // written, without them, rather than replaced by `log.failed`.
  const { logger, lines } = capture();
  logger.error("a.bigint", {
    status: BigInt(500),
    err: { name: "E", message: "m", number: BigInt(1205), code: BigInt(7) },
  } as unknown as LogFields);
  const parsed = parse(lines[0]);
  const err = parsed?.err as Record<string, unknown> | undefined;
  add(
    "never throws: BigInt values are dropped and the line is still written",
    parsed?.event === "a.bigint" &&
      !("status" in parsed) &&
      err?.message === "m" &&
      !("number" in err) &&
      !("code" in err),
    lines[0]?.text,
  );
}

/* ------------------------------------------------------ 1f. pretty output */

{
  const { logger, lines } = capture({ format: "pretty" });
  const err = new Error(`boom ${SECRET}`);
  logger.error("api.unhandled_error", { route: "/api/events", status: 500, err });
  const text = lines[0]?.text ?? "";
  const [first, ...rest] = text.trimEnd().split("\n");
  add(
    "pretty: a readable first line with time, level, event and fields",
    first?.startsWith("03:04:05.678 ERROR api.unhandled_error") === true &&
      first.includes('route="/api/events"') &&
      first.includes("status=500") &&
      first.includes("err=Error: boom ***"),
    first,
  );
  add("pretty: the stack follows, indented", rest.length > 0 && rest.every((line) => line.startsWith("    ")));
  add("pretty: not JSON", parse(lines[0]) === undefined);
  add("pretty: redacted", !text.includes(SECRET));
  add(
    "pretty: the first stack line is a frame, not the message again",
    rest[0]?.startsWith("    at ") === true && !rest.some((line) => line.includes("boom")),
    rest[0],
  );
}

{
  // An event name is a constant in code, but the type admits any string.
  const json = capture();
  const pretty = capture({ format: "pretty" });
  json.logger.info(`a.${SECRET}`);
  pretty.logger.info(`a.${SECRET}`);
  add("redaction: the event name is masked in JSON", parse(json.lines[0])?.event === "a.***", json.lines[0]?.text);
  add("redaction: the event name is masked in pretty", pretty.lines[0]?.text.includes(" a.*** ") === true || pretty.lines[0]?.text.trimEnd().endsWith(" a.***") === true, pretty.lines[0]?.text);
}

{
  // A message with newlines must stay inside one entry: no unindented line
  // after the first, and no message line repeated as a stack frame.
  const forged = "03:04:05.678 INFO  forged.event";
  const err = new Error(`first line\n${forged}\n${SECRET}`, {
    cause: new Error(`cause line\n${forged}`),
  });
  const pretty = capture({ format: "pretty" });
  pretty.logger.error("api.unhandled_error", { err });
  const lines = (pretty.lines[0]?.text ?? "").trimEnd().split("\n");
  const [first, ...rest] = lines;

  add(
    "pretty: a multi-line message stays on the first line, escaped",
    first?.includes("err=Error: first line\\n03:04:05.678 INFO  forged.event\\n***") === true,
    first,
  );
  add(
    "pretty: no line after the first is unindented",
    rest.length > 0 && rest.every((line) => line.startsWith("    ")),
    JSON.stringify(rest.filter((line) => !line.startsWith("    "))),
  );
  add(
    "pretty: message lines are not repeated as stack frames",
    rest.filter((line) => !line.startsWith("    caused by")).every((line) => line.startsWith("    at ")),
    JSON.stringify(rest.slice(0, 3)),
  );
  add(
    "pretty: a multi-line cause message stays on its line, escaped",
    rest.some((line) => line === `    caused by Error: cause line\\n${forged}`),
    JSON.stringify(rest.filter((line) => line.includes("caused by"))),
  );
  add("pretty: a multi-line message is still redacted", !pretty.lines[0]?.text.includes(SECRET));

  // JSON is unchanged: it keeps the message as it was, newlines and all, escaped
  // by JSON itself, on one line.
  const json = capture();
  json.logger.error("api.unhandled_error", { err });
  const parsedErr = parse(json.lines[0])?.err as Record<string, unknown> | undefined;
  add(
    "json: a multi-line message is kept whole on one line",
    json.lines.length === 1 &&
      json.lines[0]?.text.split("\n").length === 2 &&
      parsedErr?.message === `first line\n${forged}\n***`,
    json.lines[0]?.text,
  );
}

/* ------------------------------------------------ 1g. request id fallback */

{
  const { logger, lines } = capture({ requestId: () => "from-context" });
  logger.info("a.context");
  logger.info("a.explicit", { requestId: "explicit" });
  add(
    "request id: taken from the context, unless one is passed",
    parse(lines[0])?.requestId === "from-context" && parse(lines[1])?.requestId === "explicit",
  );
}

/* ------------------------------------------ 1h. the shared logger redacts */

{
  const written: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  setLogRedactor(redact);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    log.error("db.pool_error", { err: new Error(`cannot reach ${HOST}`) });
  } finally {
    process.stderr.write = originalWrite;
  }
  add(
    "shared logger: uses the installed redactor",
    written.length === 1 && written[0]?.includes("cannot reach ***") === true && !written[0].includes(HOST),
    written.join(""),
  );
}

{
  // A second, separately loaded copy of the module -- what a separately
  // compiled bundle such as `instrumentation.ts` gets. The query string makes
  // Node load and evaluate the file again, with its own module variables. The
  // redactor installed through the first copy above must still apply here.
  const second = (await import(
    new URL("../lib/log.ts?copy=second", import.meta.url).href
  )) as typeof import("../lib/log.ts");
  const written: string[] = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = ((chunk: string | Uint8Array) => {
    written.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    second.log.error("db.pool_error", { err: new Error(`cannot reach ${HOST}`) });
  } finally {
    process.stderr.write = originalWrite;
  }
  add("shared logger: the second copy really is a separate module instance", second.log !== log);
  add(
    "shared logger: a separate copy of the module uses the same installed redactor",
    written.length === 1 && written[0]?.includes("cannot reach ***") === true && !written[0].includes(HOST),
    written.join(""),
  );
}

/* --------------------------------------------------------- 2. config */

{
  const production = readLogConfig({ NODE_ENV: "production" });
  const development = readLogConfig({ NODE_ENV: "development" });
  const explicit = readLogConfig({ NODE_ENV: "production", LOG_LEVEL: " DEBUG ", LOG_FORMAT: "Pretty" });
  const invalid = readLogConfig({ LOG_LEVEL: "verbose", LOG_FORMAT: "xml" });

  add("config: production defaults to info and json", production.level === "info" && production.format === "json");
  add("config: elsewhere defaults to pretty", development.format === "pretty");
  add("config: values are trimmed and case-insensitive", explicit.level === "debug" && explicit.format === "pretty");
  add("config: an unknown value falls back to the default", invalid.level === "info" && invalid.format === "pretty");
}

/* ------------------------------------------------------- 3. request ids */

{
  const valid = "0F8E7C1A-1111-4222-8333-444455556666";
  const kept = requestIdFrom(new Headers({ [REQUEST_ID_HEADER]: valid }));
  const forged = requestIdFrom(new Headers({ [REQUEST_ID_HEADER]: "attacker-chosen' OR 1=1" }));
  const missing = requestIdFrom(new Headers());

  add("request id: a UUID from the proxy is kept, lower-cased", kept === valid.toLowerCase());
  add("request id: a non-UUID value is replaced", forged !== "attacker-chosen' OR 1=1" && isRequestId(forged));
  add("request id: a missing header gets a fresh id", isRequestId(missing));
  add("request id: fresh ids differ", requestIdFrom(new Headers()) !== requestIdFrom(new Headers()));
}

/* ------------------------------------------ 4. route-handler request context */

const tick = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function simulatedRequest(requestId: string, user: { id: string; name: string }, delays: number[]) {
  return runWithRequestContext(requestId, async () => {
    const seen: string[] = [];
    await tick(delays[0] ?? 0);
    noteActor(user, false);
    await tick(delays[1] ?? 0);
    // A later resolution in the same request -- a second `getCurrentUser()` --
    // must not replace the first.
    noteActor({ id: "someone-else", name: "Someone Else" }, true);
    await Promise.all([
      tick(1).then(() => seen.push(currentRequestContext().requestId ?? "none")),
      (async () => {
        await tick(delays[2] ?? 0);
        seen.push(currentRequestContext().requestId ?? "none");
      })(),
    ]);
    return { seen, context: { ...currentRequestContext() } };
  });
}

{
  const results = await Promise.all([
    simulatedRequest("req-a", { id: "user-a", name: "A" }, [5, 1, 3]),
    simulatedRequest("req-b", { id: "user-b", name: "B" }, [1, 5, 1]),
    simulatedRequest("req-c", { id: "user-c", name: "C" }, [3, 3, 5]),
  ]);

  add(
    "context: each concurrent request sees only its own id",
    results.every(({ seen }, index) => seen.every((id) => id === ["req-a", "req-b", "req-c"][index])),
    JSON.stringify(results.map(({ seen }) => seen)),
  );
  add(
    "context: each concurrent request keeps its own actor",
    results.every(({ context }, index) => context.actor?.userId === ["user-a", "user-b", "user-c"][index]),
    JSON.stringify(results.map(({ context }) => context.actor)),
  );
  add(
    "context: the first actor noted wins, with its fallback flag",
    results.every(({ context }) => context.actor?.fallback === false),
  );
}

{
  const fallback = await runWithRequestContext("req-d", async () => {
    noteActor({ id: "maya", name: "Maya" }, true);
    return currentRequestContext().actor;
  });
  add("context: a fallback is recorded as such", fallback?.fallback === true && fallback.userId === "maya");
}

{
  // Outside any request: no store, so nothing to read and nothing kept.
  noteActor({ id: "stray", name: "Stray" }, false);
  const outside = currentRequestContext();
  const later = await runWithRequestContext("req-e", async () => ({ ...currentRequestContext() }));
  add("context: outside a request there is no id", outside.requestId === undefined);
  add("context: a note outside a request is not kept", currentRequestContext().actor === undefined);
  add("context: a new request starts empty", later.requestId === "req-e" && later.actor === undefined);
}

/* ------------------------------------------------------------------ report */

const failed = checks.filter((check) => !check.ok);
for (const check of failed) {
  console.error(`FAIL  ${check.name}${check.detail ? `  (${check.detail})` : ""}`);
}
console.log(`check:logging -- ${checks.length - failed.length}/${checks.length} checks passed`);

process.exit(failed.length === 0 ? 0 : 1);
