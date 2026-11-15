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
 *      other's id or actor, and nothing survives the request;
 *   5. the API boundary (`withErrorHandling`) -- one correlated line per failed
 *      request and none otherwise, unchanged responses, and route labels that
 *      never carry the URL;
 *   6. the instrumentation hooks -- `app.started` and `next.request_error`.
 *
 * The database and mail call sites (`lib/data/client.ts`,
 * `lib/services/*`) import `server-only` and resolve `@/` paths, which bare
 * Node cannot do, so their log lines are verified on a running server.
 *
 * What it cannot check is the page-render half of the request context, which
 * depends on React scoping `cache()` to a server render. That only exists
 * inside a running Next server, so it is verified there.
 *
 * **Every value here is synthetic.** No real credential, host or person.
 *
 * Node built-ins and the modules under test only, so it runs with bare `node`.
 */

import mssql from "mssql";

import { EventEmitter } from "node:events";
import { readdirSync, readFileSync } from "node:fs";

import { ApiError, jsonError, jsonOk } from "../lib/api.ts";
import {
  AUDIT_WRITE_POLICY,
  serializeMetadata,
  toAuditRow,
  writeAudit,
  type AuditAttempt,
  type AuditInput,
  type AuditInsert,
  type AuditRow,
} from "../lib/audit.ts";
import {
  API_ROUTE_PATTERNS,
  apiRouteLabel,
  UNMATCHED_ROUTE,
  withErrorHandling,
} from "../lib/apiHandler.ts";
import { createRedactor } from "../lib/data/redact.mts";
import { API_ERRORS } from "../lib/labels.ts";
import {
  createLogger,
  log,
  readLogConfig,
  errorKind,
  serializeError,
  setLogRedactor,
  type LogFields,
  type LoggerOptions,
} from "../lib/log.ts";
import {
  currentRequestContext,
  noteActor,
  outsideRequestContext,
  runWithRequestContext,
} from "../lib/requestContext.ts";
import { isRequestId, newRequestId, REQUEST_ID_HEADER, requestIdFrom } from "../lib/requestId.ts";

// The shared logger reads its configuration on first use; JSON lines are what
// the checks below parse.
process.env.LOG_FORMAT = "json";

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

{
  // Why `outsideRequestContext` exists: an emitter's listener runs in the
  // context of whatever triggered the emit -- here a timer started during
  // request "req-old", the way a pooled socket opened by one request outlives it.
  const emitter = new EventEmitter();
  const seen: Array<string | undefined> = [];
  emitter.on("fail", () => {
    seen.push(currentRequestContext().requestId);
    outsideRequestContext(() => seen.push(currentRequestContext().requestId));
  });
  await runWithRequestContext("req-old", async () => {
    setTimeout(() => emitter.emit("fail"), 5);
  });
  await tick(20);
  add("context: a late event inherits the request that started it", seen[0] === "req-old", JSON.stringify(seen));
  add("context: outsideRequestContext detaches it", seen.length === 2 && seen[1] === undefined, JSON.stringify(seen));
}

/* --------------------------------------------- 5. the API boundary (S2) */

type Captured = { stream: "stdout" | "stderr"; record: Record<string, unknown> | undefined; text: string };

/** Everything the shared logger writes while `work` runs. */
async function captureOutput<T>(work: () => Promise<T>): Promise<{ result: T; lines: Captured[] }> {
  const lines: Captured[] = [];
  const out = process.stdout.write.bind(process.stdout);
  const err = process.stderr.write.bind(process.stderr);
  const grab = (stream: "stdout" | "stderr") =>
    ((chunk: string | Uint8Array) => {
      for (const text of String(chunk).split("\n").filter(Boolean)) {
        lines.push({ stream, record: parse({ stream, text }), text });
      }
      return true;
    }) as typeof process.stdout.write;
  process.stdout.write = grab("stdout");
  process.stderr.write = grab("stderr");
  try {
    return { result: await work(), lines };
  } finally {
    process.stdout.write = out;
    process.stderr.write = err;
  }
}

function apiRequest(path: string, requestId?: string, method = "POST"): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: requestId === undefined ? {} : { [REQUEST_ID_HEADER]: requestId },
  });
}

{
  // The list must be the routes that exist: one more on disk without a line in
  // the list would be logged as `unmatched`.
  const onDisk = (readdirSync(new URL("../app/api", import.meta.url), { recursive: true }) as string[])
    .filter((file) => file.endsWith("route.ts"))
    .map((file) => `/api/${file.replace(/\\/g, "/").replace(/\/?route\.ts$/, "")}`.replace(/\/$/, ""))
    .sort();
  const listed = [...API_ROUTE_PATTERNS].sort();
  add("routes: the pattern list matches the route files on disk", JSON.stringify(onDisk) === JSON.stringify(listed), JSON.stringify(onDisk));
}

{
  const cases: Array<[string, string]> = [
    ["/api/events", "/api/events"],
    ["/api/events/0f8e7c1a-1111-4222-8333-444455556666", "/api/events/:id"],
    ["/api/events/123/registrations", "/api/events/:id/registrations"],
    ["/api/events/1/registrations/2/approve", "/api/events/:id/registrations/:registrationId/approve"],
    ["/api/events/1/share-emails/2", "/api/events/:id/share-emails/:userId"],
    ["/api/events/<script>/cancel", "/api/events/:id/cancel"],
    ["/api/events/", "/api/events"],
    ["/api/session", "/api/session"],
    ["/api/events//cancel", UNMATCHED_ROUTE],
    ["/api/events/1/unknown", UNMATCHED_ROUTE],
    ["/api/elsewhere/someone@example.com", UNMATCHED_ROUTE],
  ];
  const wrong = cases.filter(([path, label]) => apiRouteLabel(path) !== label);
  add("routes: paths map to their pattern, and unknown ones to `unmatched`", wrong.length === 0, JSON.stringify(wrong.map(([path]) => [path, apiRouteLabel(path)])));
}

{
  const id = newRequestId();
  const handler = withErrorHandling<[Request]>(async () => {
    throw ApiError.notFound();
  });
  const { result, lines } = await captureOutput(() => handler(apiRequest("/api/events/1", id, "GET")));
  const expected = await jsonError(404, API_ERRORS.notFound, { code: "not_found" }).text();
  add("api: an ApiError below 500 keeps its response", result.status === 404 && (await result.text()) === expected);
  add("api: an ApiError below 500 writes no log line", lines.length === 0, lines.map((line) => line.text).join(""));
}

{
  const id = newRequestId();
  let seenInside: string | undefined;
  const handler = withErrorHandling<[Request]>(async () => {
    seenInside = currentRequestContext().requestId;
    return jsonOk({ ok: true });
  });
  const { result, lines } = await captureOutput(() => handler(apiRequest("/api/session", id)));
  add("api: a success writes no log line", result.status === 200 && lines.length === 0, lines.map((line) => line.text).join(""));
  add("api: the handler runs in a context carrying the proxy's id", seenInside === id);
}

{
  const id = newRequestId();
  const handler = withErrorHandling<[Request]>(async () => {
    throw new ApiError(502, "delivery failed", { code: "email_delivery_failed" });
  });
  const { result, lines } = await captureOutput(() =>
    handler(apiRequest("/api/events/1/share-emails/2?to=someone@example.com", id)),
  );
  const expected = await jsonError(502, "delivery failed", { code: "email_delivery_failed" }).text();
  const record = lines[0]?.record;
  add("api: an ApiError of 500 or more keeps its response", result.status === 502 && (await result.text()) === expected);
  add(
    "api: an ApiError of 500 or more writes one api.service_failure warning",
    lines.length === 1 &&
      lines[0]?.stream === "stderr" &&
      record?.level === "warn" &&
      record.event === "api.service_failure" &&
      record.requestId === id &&
      record.method === "POST" &&
      record.route === "/api/events/:id/share-emails/:userId" &&
      record.status === 502 &&
      record.reason === "email_delivery_failed" &&
      typeof record.durationMs === "number" &&
      !("err" in record),
    lines.map((line) => line.text).join(""),
  );
  add("api: no id, query string or address from the URL reaches the log", !/someone@example\.com|\?to=|share-emails\/2/.test(lines[0]?.text ?? ""));
}

{
  const id = newRequestId();
  const handler = withErrorHandling<[Request]>(async () => {
    throw new Error(`driver failed on ${HOST} with ${SECRET}`);
  });
  const { result, lines } = await captureOutput(() => handler(apiRequest("/api/events/0f8e7c1a-1111-4222-8333-444455556666", id, "PATCH")));
  const expected = await jsonError(500, API_ERRORS.internal, { code: "internal" }).text();
  const record = lines[0]?.record;
  const err = record?.err as Record<string, unknown> | undefined;
  add("api: an unexpected error keeps the 500 response", result.status === 500 && (await result.text()) === expected);
  add(
    "api: an unexpected error writes one api.unhandled_error with the request id",
    lines.length === 1 &&
      record?.level === "error" &&
      record.event === "api.unhandled_error" &&
      record.requestId === id &&
      record.method === "PATCH" &&
      record.route === "/api/events/:id" &&
      record.status === 500 &&
      typeof err?.stack === "string",
    lines.map((line) => line.text).join(""),
  );
  add("api: the error is redacted", !lines[0]?.text.includes(SECRET) && !lines[0]?.text.includes(HOST) && err?.message === "driver failed on *** with ***");
}

{
  let seenInside: string | undefined;
  const handler = withErrorHandling<[Request]>(async () => {
    seenInside = currentRequestContext().requestId;
    throw new Error("x");
  });
  const { lines } = await captureOutput(() => handler(apiRequest("/api/session", "client-chosen")));
  add(
    "api: a client value that is not a UUID is replaced, and the log carries the replacement",
    isRequestId(seenInside) && seenInside !== "client-chosen" && lines[0]?.record?.requestId === seenInside,
  );
}

{
  const handler = withErrorHandling(async () => {
    throw new Error("no request");
  });
  const { lines } = await captureOutput(() => (handler as () => Promise<Response>)());
  const record = lines[0]?.record;
  add(
    "api: a call without a request still logs, with a fresh id and no route",
    lines.length === 1 && isRequestId(record?.requestId as string) && record?.route === UNMATCHED_ROUTE && !("method" in (record ?? {})),
    lines[0]?.text,
  );
}

{
  const handler = withErrorHandling(async (request: Request) => {
    const own = request.headers.get(REQUEST_ID_HEADER);
    await tick(Math.floor(Math.random() * 10));
    if (currentRequestContext().requestId !== own) throw new Error("context crossed");
    await tick(Math.floor(Math.random() * 10));
    throw new Error(`failure for ${own}`);
  });
  const ids = Array.from({ length: 10 }, () => newRequestId());
  const { lines } = await captureOutput(() => Promise.all(ids.map((id) => handler(apiRequest("/api/events", id)))));
  const pairs = lines.map((line) => [line.record?.requestId, (line.record?.err as Record<string, unknown> | undefined)?.message]);
  add(
    "api: ten concurrent failures each log once, under their own id",
    lines.length === 10 &&
      new Set(lines.map((line) => line.record?.requestId)).size === 10 &&
      pairs.every(([id, message]) => message === `failure for ${id}` && ids.includes(id as string)),
    JSON.stringify(pairs),
  );
}

/* ------------------------------------- 5b. mail network failures (S2) */

{
  // A mail service URL with credentials in it. `fetch` refuses it before any
  // network access, with a message that quotes the whole URL -- the failure
  // `sendMail` logs as `reason: "network"`. Synthetic; nothing is contacted.
  const MAIL_PASSWORD = "SyntheticMailPw9";
  const mailUrl = `http://mailuser:${MAIL_PASSWORD}@mail.example.invalid:8080/sendMail`;
  let thrown: unknown;
  try {
    await fetch(mailUrl, { method: "POST", body: "{}" });
  } catch (error) {
    thrown = error;
  }
  add(
    "mail: the raw fetch error does quote the password (so the check below means something)",
    serializeError(thrown, redact).message.includes(MAIL_PASSWORD),
  );

  const { lines } = await captureOutput(async () => {
    log.error("mail.send_failed", { component: "mail", reason: "network", err: errorKind(thrown) });
  });
  const err = lines[0]?.record?.err as Record<string, unknown> | undefined;
  add(
    "mail: a network failure is logged by kind only, without the URL or password",
    lines.length === 1 &&
      err?.name === "TypeError" &&
      err.message === "" &&
      !("stack" in err) &&
      !lines[0]?.text.includes(MAIL_PASSWORD) &&
      !lines[0]?.text.includes("mail.example.invalid"),
    lines[0]?.text,
  );

  const refused = Object.assign(new TypeError("fetch failed"), {
    cause: Object.assign(new Error("connect ECONNREFUSED 10.1.2.3:2525"), { code: "ECONNREFUSED" }),
  });
  const kind = errorKind(refused);
  add("mail: the transport's code is kept from the cause", kind.name === "TypeError" && kind.code === "ECONNREFUSED", JSON.stringify(kind));
  add(
    "mail: a name or code that is not one is dropped",
    errorKind({ name: "<b>x</b>", code: "not a code; 10.1.2.3" }).name === "Error" &&
      errorKind({ name: "E", code: "not a code; 10.1.2.3" }).code === undefined &&
      errorKind("text").name === "NonError",
  );
}

/* ------------------------------------------- 6. instrumentation hooks (S2) */

{
  const instrumentation = await import("../instrumentation.ts");
  const runtime = process.env.NEXT_RUNTIME;
  try {
    process.env.NEXT_RUNTIME = "nodejs";
    const started = await captureOutput(() => instrumentation.register());
    const record = started.lines[0]?.record;
    add(
      "instrumentation: register() logs app.started, with nothing but the component",
      started.lines.length === 1 &&
        started.lines[0]?.stream === "stdout" &&
        record?.level === "info" &&
        record.event === "app.started" &&
        Object.keys(record).sort().join(",") === "component,event,level,pid,ts",
      started.lines[0]?.text,
    );

    const id = newRequestId();
    const failed = await captureOutput(() =>
      instrumentation.onRequestError(
        new Error(`render failed on ${HOST}`),
        { path: "/events/0f8e7c1a-1111-4222-8333-444455556666?tab=x", method: "GET", headers: { [REQUEST_ID_HEADER]: id } },
        { routerKind: "App Router", routePath: "/events/[id]", routeType: "render", renderSource: "react-server-components", revalidateReason: undefined },
      ) as Promise<void>,
    );
    const error = failed.lines[0]?.record;
    add(
      "instrumentation: onRequestError logs next.request_error with Next's route pattern and the id",
      failed.lines.length === 1 &&
        error?.event === "next.request_error" &&
        error.level === "error" &&
        error.requestId === id &&
        error.route === "/events/:id" &&
        error.method === "GET" &&
        error.reason === "render" &&
        !failed.lines[0]?.text.includes("0f8e7c1a") &&
        !failed.lines[0]?.text.includes("tab=x") &&
        !failed.lines[0]?.text.includes(HOST),
      failed.lines[0]?.text,
    );

    const forged = await captureOutput(() =>
      instrumentation.onRequestError(
        new Error("x"),
        { path: "/events", method: "GET", headers: { [REQUEST_ID_HEADER]: "client-chosen" } },
        { routerKind: "App Router", routePath: "/events", routeType: "render", revalidateReason: undefined },
      ) as Promise<void>,
    );
    add("instrumentation: a request id that is not a UUID is left out", forged.lines.length === 1 && !("requestId" in (forged.lines[0]?.record ?? {})), forged.lines[0]?.text);

    // The same error object reported twice for one request -- a layout and a
    // page awaiting one failed promise -- is one line; for another request, or
    // a different error, it is its own line.
    const shared = new Error("shared failure");
    const other = newRequestId();
    const context = { routerKind: "App Router", routePath: "/events", routeType: "render", revalidateReason: undefined } as const;
    const report = (err: unknown, rid: string) =>
      instrumentation.onRequestError(err, { path: "/events", method: "GET", headers: { [REQUEST_ID_HEADER]: rid } }, context) as Promise<void>;
    const repeated = await captureOutput(async () => {
      await report(shared, id);
      await report(shared, id);
      await report(shared, other);
      await report(new Error("another failure"), id);
    });
    add(
      "instrumentation: a repeated report of one error in one request is logged once",
      repeated.lines.length === 3 &&
        repeated.lines.filter((line) => line.record?.requestId === id).length === 2 &&
        repeated.lines.filter((line) => line.record?.requestId === other).length === 1,
      repeated.lines.map((line) => line.text).join(""),
    );

    // No request id: nothing tells two requests apart, so every report is logged.
    const idless = new Error("id-less failure");
    const noId = await captureOutput(async () => {
      for (let i = 0; i < 2; i += 1) {
        await instrumentation.onRequestError(idless, { path: "/events", method: "GET", headers: {} }, context);
      }
    });
    add("instrumentation: reports without a request id are never merged", noId.lines.length === 2, String(noId.lines.length));

    // Interleaved requests sharing one error: A, B, A, B is one line each.
    const sharedFailure = new Error("one connection attempt");
    const [a, b] = [newRequestId(), newRequestId()];
    const interleaved = await captureOutput(async () => {
      for (const rid of [a, b, a, b]) await report(sharedFailure, rid);
    });
    add(
      "instrumentation: interleaved requests sharing one error log once each",
      interleaved.lines.length === 2 &&
        interleaved.lines[0]?.record?.requestId === a &&
        interleaved.lines[1]?.record?.requestId === b,
      interleaved.lines.map((line) => line.text).join(""),
    );

    // Ten concurrent requests, each reporting the same error twice, in a
    // shuffled order: ten lines, one per request.
    const concurrentFailure = new Error("shared by ten");
    const ten = Array.from({ length: 10 }, () => newRequestId());
    const concurrent = await captureOutput(() =>
      Promise.all(
        [...ten, ...ten].map(async (rid, index) => {
          await tick((index * 7) % 5);
          await report(concurrentFailure, rid);
        }),
      ),
    );
    add(
      "instrumentation: concurrent requests sharing one error log once each",
      concurrent.lines.length === 10 && new Set(concurrent.lines.map((line) => line.record?.requestId)).size === 10,
      String(concurrent.lines.length),
    );

    // A long-lived error met by many requests: memory per error is bounded
    // (32 ids), and the cost of the bound is a repeat, never a lost line.
    const longLived = new Error("cached rejection");
    const many = Array.from({ length: 40 }, () => newRequestId());
    const bounded = await captureOutput(async () => {
      for (const rid of many) await report(longLived, rid);
    });
    const afterwards = await captureOutput(async () => {
      await report(longLived, many[39] as string);
      await report(longLived, many[0] as string);
    });
    add(
      "instrumentation: a long-lived error logs every new request and remembers only the recent ones",
      bounded.lines.length === 40 &&
        afterwards.lines.length === 1 &&
        afterwards.lines[0]?.record?.requestId === many[0],
      `${bounded.lines.length} then ${afterwards.lines.map((line) => line.record?.requestId).join(",")}`,
    );

    process.env.NEXT_RUNTIME = "edge";
    const edge = await captureOutput(async () => {
      await instrumentation.register();
      await instrumentation.onRequestError(new Error("x"), { path: "/", method: "GET", headers: {} }, { routerKind: "App Router", routePath: "/", routeType: "render", revalidateReason: undefined });
    });
    add("instrumentation: nothing is logged outside the Node.js runtime", edge.lines.length === 0);
  } finally {
    if (runtime === undefined) delete process.env.NEXT_RUNTIME;
    else process.env.NEXT_RUNTIME = runtime;
  }
}

/* ---------------------------------------------- 7. logger fields (S3) */

{
  const { logger, lines } = capture();
  logger.error("audit.write_failed", {
    outcome: "success",
    attempts: 2,
    ambiguous: true,
  });
  logger.error("audit.write_failed", { ambiguous: "true", attempts: "2" } as unknown as LogFields);
  const first = parse(lines[0]);
  const second = parse(lines[1]);
  add(
    "fields: outcome, attempts and the boolean ambiguous are kept",
    first?.outcome === "success" && first.attempts === 2 && first.ambiguous === true,
    lines[0]?.text,
  );
  add("fields: ambiguous and attempts of the wrong kind are dropped", second !== undefined && !("ambiguous" in second) && !("attempts" in second));

  const pretty = capture({ format: "pretty" });
  pretty.logger.error("audit.write_failed", { ambiguous: false, attempts: 1 });
  add("fields: pretty output prints a boolean", pretty.lines[0]?.text.includes("ambiguous=false") === true, pretty.lines[0]?.text);
}

/* -------------------------------------------------- 8. audit records (S3) */

const AUDIT_ACTOR = { userId: "ea7cd7ca-ac2a-4dd4-9d17-f03d8994b5cd", name: "Synthetic Actor Name" };
const AUDIT_EVENT = "2dc1388d-c0bf-4bfd-a73b-1b21228d990d";

function auditInput(overrides: Partial<AuditInput> = {}): AuditInput {
  return {
    occurredAt: new Date("2026-11-15T10:00:00.000Z"),
    requestId: newRequestId(),
    actor: AUDIT_ACTOR,
    channel: "api",
    httpMethod: "POST",
    route: "/api/events/:id/registrations",
    operation: "registration.register",
    eventId: AUDIT_EVENT,
    subject: { type: "registration", id: "0f8e7c1a-1111-4222-8333-444455556666" },
    outcome: "success",
    httpStatus: 200,
    reasonCode: null,
    durationMs: 42,
    metadata: { actorFallback: true },
    ...overrides,
  };
}

{
  const id = "0F8E7C1A-2222-4222-8333-444455556666";
  const result = toAuditRow(auditInput({ requestId: "AAAAAAAA-1111-4222-8333-444455556666" }), id);
  add(
    "audit: a valid record becomes a row, ids lower-cased, metadata serialised",
    result.ok &&
      result.row.id === id.toLowerCase() &&
      result.row.requestId === "aaaaaaaa-1111-4222-8333-444455556666" &&
      result.row.actorUserId === AUDIT_ACTOR.userId &&
      result.row.actorName === AUDIT_ACTOR.name &&
      result.row.subjectType === "registration" &&
      result.row.metadata === '{"actorFallback":true}',
    JSON.stringify(result),
  );

  const anonymous = toAuditRow(auditInput({ actor: null, eventId: null, subject: null, metadata: null }), newRequestId());
  add(
    "audit: no actor, event, subject or metadata gives NULLs",
    anonymous.ok &&
      anonymous.row.actorUserId === null &&
      anonymous.row.actorName === null &&
      anonymous.row.eventId === null &&
      anonymous.row.subjectType === null &&
      anonymous.row.subjectId === null &&
      anonymous.row.metadata === null,
  );
}

{
  const bad: Array<[string, Partial<AuditInput>]> = [
    ["occurredAt", { occurredAt: new Date("not a date") }],
    ["requestId", { requestId: "client-chosen" }],
    ["actor.userId", { actor: { userId: "maya", name: "x" } }],
    ["actor.name", { actor: { userId: AUDIT_ACTOR.userId, name: "x".repeat(201) } }],
    ["actor.name", { actor: { userId: AUDIT_ACTOR.userId, name: "" } }],
    ["channel", { channel: "cli" as AuditInput["channel"] }],
    ["httpMethod", { httpMethod: "post" }],
    ["httpMethod", { httpMethod: "VERYLONGMETHOD" }],
    ["route", { route: "/api/events/123?email=someone@example.com" }],
    ["route", { route: "api/events" }],
    ["route", { route: `/${"a".repeat(200)}` }],
    ["operation", { operation: "event.hack" as AuditInput["operation"] }],
    ["eventId", { eventId: "123" }],
    ["subject.type", { subject: { type: "event" as "user", id: AUDIT_EVENT } }],
    ["subject.id", { subject: { type: "user", id: "tom" } }],
    ["outcome", { outcome: "ok" as AuditInput["outcome"] }],
    ["httpStatus", { httpStatus: 99 }],
    ["httpStatus", { httpStatus: 600 }],
    ["httpStatus", { httpStatus: 200.5 }],
    ["reasonCode", { reasonCode: "Not a code" }],
    ["reasonCode", { reasonCode: "x".repeat(65) }],
    ["durationMs", { durationMs: -1 }],
    ["durationMs", { durationMs: 1.5 }],
  ];
  const wrong = bad.filter(([field, overrides]) => {
    const result = toAuditRow(auditInput(overrides), newRequestId());
    return result.ok || result.problem !== field;
  });
  add(
    "audit: every out-of-range field is refused, naming the field",
    wrong.length === 0,
    JSON.stringify(wrong.map(([field]) => field)),
  );
  add("audit: a row id that is not a UUID is refused", !toAuditRow(auditInput(), "not-a-uuid").ok);
  add(
    "audit: allowed reason codes pass",
    ["closed:started", "email_delivery_failed", "full", "post_commit_error"].every(
      (reasonCode) => toAuditRow(auditInput({ reasonCode }), newRequestId()).ok,
    ),
  );
}

{
  const serialized = serializeMetadata({
    section: "upcoming",
    filters: { category: "design", access: 7, "bad\nkey": "x" },
    view: "host",
    resultStatus: "pending",
    fieldErrors: ["title", 3, "startsAt"],
    actorFallback: "yes",
    email: "someone@example.com",
    body: { message: "private" },
  });
  add(
    "audit: metadata keeps only allowlisted keys and values of the right kind",
    serialized ===
      '{"section":"upcoming","view":"host","resultStatus":"pending","filters":{"category":"design"},"fieldErrors":["title","startsAt"]}',
    serialized ?? "null",
  );
  add(
    "audit: metadata strings that are long or multi-line are dropped",
    serializeMetadata({ section: "x".repeat(101), view: "a\nb" }) === null,
  );
  add("audit: metadata with nothing allowed left is NULL", serializeMetadata({ email: "a@b.c" }) === null && serializeMetadata(null) === null);
}

/* ---------------------------------------------- 9. the D15 write (S3) */

const driverError = (props: Record<string, unknown>) =>
  Object.assign(new Error("driver said: SECRET_DRIVER_TEXT about Synthetic Actor Name"), props);

type InsertCall = { row: AuditRow; timeout: number; at: number };

/** A fake insert that plays the given steps, one per attempt. */
function scriptedInsert(steps: Array<(attempt: AuditAttempt) => Promise<void>>): { insert: AuditInsert; calls: InsertCall[] } {
  const calls: InsertCall[] = [];
  const startedAt = performance.now();
  const insert: AuditInsert = (row, timeout, attempt) => {
    calls.push({ row, timeout, at: performance.now() - startedAt });
    const step = steps[calls.length - 1];
    if (step === undefined) throw new Error("unexpected extra attempt");
    return step(attempt);
  };
  return { insert, calls };
}

const succeed = async () => undefined;
const failWith = (props: Record<string, unknown>, afterMs = 0) => async () => {
  await tick(afterMs);
  throw driverError(props);
};

function lineFor(lines: Captured[], event: string) {
  return lines.find((line) => line.record?.event === event);
}

{
  const input = auditInput();
  const { insert, calls } = scriptedInsert([succeed]);
  const { result, lines } = await captureOutput(() => writeAudit(input, insert));
  add(
    "d15: a successful write is one attempt with the 1,000 ms first timeout, and logs nothing",
    result.status === "written" &&
      result.attempts === 1 &&
      calls.length === 1 &&
      calls[0]?.timeout === AUDIT_WRITE_POLICY.firstAttemptTimeoutMs &&
      calls[0].row.requestId === input.requestId &&
      lines.length === 0,
    JSON.stringify({ result, calls: calls.length, lines: lines.length }),
  );
}

{
  const { insert, calls } = scriptedInsert([failWith({ code: "ESOCKET" }), succeed]);
  const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
  add(
    "d15: a dropped connection is retried once, with the time that remains, and succeeds",
    result.status === "written" &&
      result.attempts === 2 &&
      (calls[1]?.timeout ?? 0) >= AUDIT_WRITE_POLICY.minRemainingForRetryMs &&
      (calls[1]?.timeout ?? 0) <= AUDIT_WRITE_POLICY.deadlineMs &&
      calls[0]?.row.id === calls[1]?.row.id &&
      lines.length === 0,
    JSON.stringify({ result, timeouts: calls.map((call) => call.timeout) }),
  );
}

{
  const { insert } = scriptedInsert([failWith({ code: "ECONNRESET" }), failWith({ code: "EREQUEST", number: 2627 })]);
  const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
  add(
    "d15: a duplicate key after a retry means already written, not a failure",
    result.status === "deduplicated" && result.attempts === 2 && !lineFor(lines, "audit.write_failed"),
    JSON.stringify(result),
  );
}

{
  const input = auditInput();
  const { insert, calls } = scriptedInsert([failWith({ code: "EREQUEST", originalError: { number: 2601 } })]);
  const { result, lines } = await captureOutput(() => writeAudit(input, insert));
  const warning = lineFor(lines, "audit.duplicate_request")?.record;
  add(
    "d15: a duplicate key (2601) on the first attempt is a caller bug: one warning, no retry",
    result.status === "deduplicated" &&
      calls.length === 1 &&
      warning?.level === "warn" &&
      warning.requestId === input.requestId &&
      !lineFor(lines, "audit.write_failed"),
    lines.map((line) => line.text).join(""),
  );
}

{
  const input = auditInput();
  const { insert, calls } = scriptedInsert([failWith({ code: "EREQUEST", number: 208 })]);
  const { result, lines } = await captureOutput(() => writeAudit(input, insert));
  const failure = lineFor(lines, "audit.write_failed");
  const err = failure?.record?.err as Record<string, unknown> | undefined;
  add(
    "d15: a missing table (208) is not retried and is a definite failure",
    result.status === "failed" &&
      calls.length === 1 &&
      result.ambiguous === false &&
      failure?.record?.reason === "sql_error" &&
      failure.record.ambiguous === false &&
      err?.number === 208,
    failure?.text,
  );
  add(
    "d15: the failure line carries the approved fields and nothing about the actor or the driver's text",
    failure?.record?.requestId === input.requestId &&
      failure.record.op === "registration.register" &&
      failure.record.outcome === "success" &&
      failure.record.status === 200 &&
      failure.record.attempts === 1 &&
      typeof failure.record.durationMs === "number" &&
      !/SECRET_DRIVER_TEXT|Synthetic Actor Name|ea7cd7ca|2dc1388d|actorFallback/.test(failure.text),
    failure?.text,
  );
}

{
  const { insert, calls } = scriptedInsert([failWith({ code: "EREQUEST", number: 515 })]);
  const { result } = await captureOutput(() => writeAudit(auditInput(), insert));
  add("d15: a permanent SQL error (515) is not retried", result.status === "failed" && calls.length === 1);
}

{
  const { insert, calls } = scriptedInsert([failWith({ code: "EREQUEST", number: 1205 }), succeed]);
  const { result } = await captureOutput(() => writeAudit(auditInput(), insert));
  add("d15: a deadlock victim (1205) is retried", result.status === "written" && calls.length === 2);
}

{
  const { insert, calls } = scriptedInsert([failWith({ code: "ETIMEOUT" })]);
  const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
  const failure = lineFor(lines, "audit.write_failed")?.record;
  add(
    "d15: a timeout is never retried, and its outcome is unknown",
    result.status === "failed" && calls.length === 1 && result.ambiguous && failure?.reason === "timeout" && failure.ambiguous === true,
    JSON.stringify(failure),
  );
}

{
  const { insert, calls } = scriptedInsert([failWith({ code: "ECANCEL" })]);
  const { result } = await captureOutput(() => writeAudit(auditInput(), insert));
  add("d15: a cancellation is never retried", result.status === "failed" && calls.length === 1 && result.ambiguous);
}

{
  // The first attempt fails retryably, but with under 300 ms of the deadline
  // left: no retry, and the dropped connection leaves the outcome unknown.
  const { insert, calls } = scriptedInsert([failWith({ code: "ESOCKET" }, 1250)]);
  const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
  const failure = lineFor(lines, "audit.write_failed")?.record;
  add(
    "d15: no retry when less than 300 ms remain",
    result.status === "failed" && calls.length === 1 && failure?.reason === "connection" && failure.ambiguous === true,
    JSON.stringify({ calls: calls.length, failure }),
  );
}

{
  let cancelled = false;
  let startedQueryLate = false;
  const timersBefore = process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;
  const hanging = scriptedInsert([
    (attempt) =>
      new Promise<void>(() => {
        attempt.cancel = () => {
          cancelled = true;
          throw new Error("cancel failed");
        };
      }),
  ]);
  const started = performance.now();
  const { result, lines } = await captureOutput(() => writeAudit(auditInput(), hanging.insert));
  const took = performance.now() - started;
  const failure = lineFor(lines, "audit.write_failed")?.record;
  add(
    "d15: a hanging insert is cut off at the 1,500 ms deadline, cancelled, and reported as unknown",
    result.status === "failed" &&
      failure?.reason === "deadline" &&
      failure.ambiguous === true &&
      cancelled &&
      took >= AUDIT_WRITE_POLICY.deadlineMs - 20 &&
      took < AUDIT_WRITE_POLICY.deadlineMs + 300,
    JSON.stringify({ took: Math.round(took), failure }),
  );

  // An attempt still waiting for a connection when the deadline passes is
  // told not to start its query.
  const waiting = scriptedInsert([
    async (attempt) => {
      await tick(AUDIT_WRITE_POLICY.deadlineMs + 100);
      startedQueryLate = !attempt.abandoned;
    },
  ]);
  await captureOutput(() => writeAudit(auditInput(), waiting.insert));
  await tick(200);
  add("d15: an attempt still waiting for a connection is abandoned at the deadline", !startedQueryLate);

  const timersAfter = process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;
  add("d15: no deadline timer is left behind after a deadline", timersAfter <= timersBefore, `${timersBefore} -> ${timersAfter}`);

  // And on the success path, where the deadline never fires and must be
  // cleared: measured tightly around one write.
  const countTimers = () => process.getActiveResourcesInfo().filter((kind) => kind === "Timeout").length;
  const beforeSuccess = countTimers();
  await captureOutput(() => writeAudit(auditInput(), scriptedInsert([succeed]).insert));
  const afterSuccess = countTimers();
  add("d15: no deadline timer is left behind after a success", afterSuccess === beforeSuccess, `${beforeSuccess} -> ${afterSuccess}`);
}

{
  const { insert } = scriptedInsert([
    () => {
      throw new TypeError("synchronous bug");
    },
  ]);
  let threw = false;
  const { result, lines } = await captureOutput(async () => {
    try {
      return await writeAudit(auditInput(), insert);
    } catch {
      threw = true;
      return undefined;
    }
  });
  add(
    "d15: a synchronous throw from the insert does not escape",
    !threw && result?.status === "failed" && lineFor(lines, "audit.write_failed")?.record?.reason === "writer_bug",
  );
}

{
  const { insert, calls } = scriptedInsert([succeed]);
  const { result, lines } = await captureOutput(() => writeAudit(auditInput({ requestId: "client-chosen" }), insert));
  const failure = lineFor(lines, "audit.write_failed")?.record;
  add(
    "d15: an invalid record is not written and is logged as invalid_record",
    result.status === "invalid" && calls.length === 0 && failure?.reason === "invalid_record:requestId" && !("requestId" in (failure ?? {})) && !JSON.stringify(failure).includes("client-chosen"),
    JSON.stringify(failure),
  );
}

{
  const filters = Object.fromEntries(Array.from({ length: 30 }, (_, index) => [`filter${index}`, "x".repeat(40)]));
  const input = auditInput({ metadata: { filters } });
  const { insert, calls } = scriptedInsert([succeed]);
  const { result, lines } = await captureOutput(() => writeAudit(input, insert));
  const dropped = lineFor(lines, "audit.metadata_dropped");
  add(
    "d15: oversized metadata is dropped, the row is still written, and the value is not logged",
    result.status === "written" &&
      calls[0]?.row.metadata === null &&
      dropped?.record?.level === "warn" &&
      dropped.record.requestId === input.requestId &&
      !dropped.text.includes("filter0") &&
      !dropped.text.includes("xxxx"),
    dropped?.text,
  );
}

{
  // Ten concurrent writes: each row is its own record, and each failure line
  // carries its own request id.
  const inputs = Array.from({ length: 10 }, (_, index) =>
    auditInput({ httpStatus: 200 + index, durationMs: index }),
  );
  const rows: AuditRow[] = [];
  const insert: AuditInsert = async (row) => {
    await tick(Math.floor(Math.random() * 15));
    if (row.httpStatus % 2 === 1) throw driverError({ code: "EREQUEST", number: 547 });
    rows.push(row);
  };
  const { result, lines } = await captureOutput(() => Promise.all(inputs.map((input) => writeAudit(input, insert))));
  const failures = lines.filter((line) => line.record?.event === "audit.write_failed");
  add(
    "d15: concurrent writes keep their own records and failure lines",
    result.filter((outcome) => outcome.status === "written").length === 5 &&
      rows.every((row) => inputs.some((input) => input.requestId === row.requestId && input.httpStatus === row.httpStatus)) &&
      failures.length === 5 &&
      failures.every((line) =>
        inputs.some((input) => input.requestId === line.record?.requestId && input.httpStatus === line.record?.status),
      ),
    JSON.stringify({ written: rows.length, failures: failures.length }),
  );
}

/* -------------------------- 9b. failure classification follow-up (S3) */

// The driver's own error classes, wrapped the way `mssql` wraps them, so the
// checks see exactly the shape a real failure has: `ECLOSE` arrives as a
// RequestError whose `number` is the string "ECLOSE", not a SQL number.
const driverWrapped = (code: string) =>
  new mssql.RequestError(Object.assign(new Error(`tedious: SECRET_DRIVER_TEXT ${code}`), { code }), "EREQUEST");

{
  const cases: Array<[string, unknown]> = [
    ["ECLOSE", driverWrapped("ECLOSE")],
    ["EPIPE", driverWrapped("EPIPE")],
    ["an unknown code", driverError({ code: "ESOMETHINGNEW" })],
  ];
  const wrong: string[] = [];
  for (const [label, error] of cases) {
    const { insert, calls } = scriptedInsert([
      async () => {
        throw error;
      },
    ]);
    const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
    const failure = lineFor(lines, "audit.write_failed");
    if (
      !(
        result.status === "failed" &&
        result.ambiguous &&
        calls.length === 1 &&
        failure?.record?.reason === "connection" &&
        failure.record.ambiguous === true &&
        !failure.text.includes("SECRET_DRIVER_TEXT")
      )
    ) {
      wrong.push(`${label}: ${failure?.text ?? JSON.stringify(result)}`);
    }
  }
  add(
    "d15: a connection lost mid-query (ECLOSE, EPIPE, unknown codes) is an unknown outcome, not retried",
    wrong.length === 0,
    wrong.join(" | "),
  );
}

{
  // Raised before anything is sent: a definite non-write.
  const { insert } = scriptedInsert([
    async () => {
      throw new mssql.ConnectionError(Object.assign(new Error("Login failed"), { code: "ELOGIN" }), "ELOGIN");
    },
  ]);
  const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
  const failure = lineFor(lines, "audit.write_failed")?.record;
  add(
    "d15: a login failure (ELOGIN) is a definite failure",
    result.status === "failed" && !result.ambiguous && failure?.reason === "connection" && failure.ambiguous === false,
    JSON.stringify(failure),
  );
}

{
  // Getting a connection failed with no driver code: the connection string
  // is missing, or the pool could not hand one out. Not the writer's bug, and
  // nothing was sent. The message (which names a variable) is not logged.
  const cases = [
    new Error("EVENTS_DB_CONNECTION_STRING is not set. Copy .env.example to .env.local"),
    Object.assign(new Error("operation timed out for an unknown reason"), { name: "TimeoutError" }),
  ];
  const labels: string[] = [];
  for (const error of cases) {
    const { insert } = scriptedInsert([
      async () => {
        throw error;
      },
    ]);
    const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
    const failure = lineFor(lines, "audit.write_failed");
    labels.push(
      `${failure?.record?.reason}/${failure?.record?.ambiguous}/${result.ambiguous}/${failure?.text.includes("EVENTS_DB_CONNECTION_STRING")}`,
    );
  }
  add(
    "d15: a failure to get a connection is `connection`, definite, and its message is not logged",
    labels.every((label) => label === "connection/false/false/false"),
    labels.join(", "),
  );
}

{
  // The other way round: a programming error stays `writer_bug`.
  const { insert } = scriptedInsert([
    async () => {
      throw new TypeError("cannot read properties of undefined");
    },
  ]);
  const { lines } = await captureOutput(() => writeAudit(auditInput(), insert));
  add("d15: a programming error from the insert is still writer_bug", lineFor(lines, "audit.write_failed")?.record?.reason === "writer_bug");
}

{
  // A retryable failure, then a permanent one: the first attempt may have
  // written the row, so the outcome stays unknown.
  const { insert, calls } = scriptedInsert([failWith({ code: "ESOCKET" }), failWith({ code: "EREQUEST", number: 208 })]);
  const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
  const failure = lineFor(lines, "audit.write_failed")?.record;
  add(
    "d15: a retryable failure then a permanent one stays ambiguous",
    result.status === "failed" &&
      calls.length === 2 &&
      result.ambiguous &&
      failure?.reason === "sql_error" &&
      failure.ambiguous === true &&
      failure.attempts === 2,
    JSON.stringify(failure),
  );
}

{
  // A retry that is still running when the deadline passes.
  let secondCancelled = false;
  const { insert, calls } = scriptedInsert([
    failWith({ code: "ECONNRESET" }),
    (attempt) =>
      new Promise<void>(() => {
        attempt.cancel = () => {
          secondCancelled = true;
        };
      }),
  ]);
  const { result, lines } = await captureOutput(() => writeAudit(auditInput(), insert));
  const failure = lineFor(lines, "audit.write_failed")?.record;
  add(
    "d15: a retry overtaken by the deadline is cancelled and reported as unknown",
    result.status === "failed" &&
      calls.length === 2 &&
      secondCancelled &&
      failure?.reason === "deadline" &&
      failure.ambiguous === true &&
      failure.attempts === 2,
    JSON.stringify(failure),
  );
}

{
  // The 300 ms boundary, on a clock the check drives, so no real waiting is
  // involved: with exactly 300 ms left the retry happens, with 299 it does not.
  const boundary = async (remainingMs: number) => {
    let clock = 0;
    const { insert, calls } = scriptedInsert([
      async () => {
        clock = AUDIT_WRITE_POLICY.deadlineMs - remainingMs;
        throw driverError({ code: "ESOCKET" });
      },
      succeed,
    ]);
    const { result } = await captureOutput(() => writeAudit(auditInput(), insert, { now: () => clock }));
    return { attempts: calls.length, status: result.status, retryTimeout: calls[1]?.timeout };
  };
  const at300 = await boundary(300);
  const at299 = await boundary(299);
  add(
    "d15: a retry needs at least 300 ms left -- 300 retries (with a 300 ms timeout), 299 does not",
    at300.attempts === 2 && at300.status === "written" && at300.retryTimeout === 300 && at299.attempts === 1 && at299.status === "failed",
    JSON.stringify({ at300, at299 }),
  );
}

{
  const bad: Array<[string, unknown]> = [
    ["occurredAt", auditInput({ occurredAt: new Date(Date.UTC(10000, 0, 1)) })],
    ["occurredAt", auditInput({ occurredAt: new Date(Date.UTC(-1, 0, 1)) })],
    ["input", null],
    ["input", "not a record"],
  ];
  const wrong = bad.filter(([field, input]) => {
    const result = toAuditRow(input as AuditInput, newRequestId());
    return result.ok || result.problem !== field;
  });
  const edges = [new Date(Date.UTC(1, 0, 1)), new Date(Date.UTC(9999, 11, 31, 23, 59, 59, 999))];
  add(
    "audit: dates outside datetime2 (years 1-9999) and non-object input are refused",
    wrong.length === 0 && edges.every((occurredAt) => toAuditRow(auditInput({ occurredAt }), newRequestId()).ok),
    JSON.stringify(wrong.map(([field]) => field)),
  );

  const { insert, calls } = scriptedInsert([succeed]);
  let threw = false;
  const { result, lines } = await captureOutput(async () => {
    try {
      return await writeAudit(null as unknown as AuditInput, insert);
    } catch {
      threw = true;
      return undefined;
    }
  });
  add(
    "d15: a null record is invalid_record:input, not a writer bug, and nothing is inserted",
    !threw && result?.status === "invalid" && calls.length === 0 && lineFor(lines, "audit.write_failed")?.record?.reason === "invalid_record:input",
  );

  const far = await captureOutput(() =>
    writeAudit(auditInput({ occurredAt: new Date(Date.UTC(10000, 0, 1)) }), scriptedInsert([succeed]).insert),
  );
  add(
    "d15: an out-of-range date is invalid_record:occurredAt, before any insert",
    far.result.status === "invalid" && lineFor(far.lines, "audit.write_failed")?.record?.reason === "invalid_record:occurredAt",
  );
}

/* --------------------------- 10. the insert and the schema agree (S3) */

{
  // `lib/data/audit.ts` cannot be loaded here (it imports `server-only`), so
  // its statement is checked as text against migration 0004: the same
  // columns, every value a typed parameter, nothing interpolated.
  const source = readFileSync(new URL("../lib/data/audit.ts", import.meta.url), "utf8");
  const migration = readFileSync(new URL("../migrations/0004_create_audit_log.sql", import.meta.url), "utf8");

  const statement = /const INSERT_AUDIT = `([\s\S]*?)`;/.exec(source)?.[1] ?? "";
  const columns = /\(([^)]*)\)\s*VALUES/.exec(statement)?.[1]?.split(",").map((column) => column.trim()) ?? [];
  const params = /VALUES\s*\(([^)]*)\)/.exec(statement)?.[1]?.split(",").map((param) => param.trim()) ?? [];
  const inputs = [...source.matchAll(/\.input\("(\w+)", sql\.(\w+)(?:\((\d+)\))?, /g)].map((match) => ({
    name: match[1],
    type: match[2],
    length: match[3],
  }));
  const tableColumns = [
    ...migration.matchAll(/^\s{4}(\w+)\s+(uniqueidentifier|datetime2\(3\)|nvarchar\((\d+)\)|smallint|int)(?=\s)/gm),
  ].map((match) => ({ name: match[1] as string, type: match[2] as string, length: match[3] }));

  const lowerFirst = (name: string) => name.charAt(0).toLowerCase() + name.slice(1);
  const expectedType: Record<string, string> = {
    uniqueidentifier: "UniqueIdentifier",
    "datetime2(3)": "DateTime2",
    smallint: "SmallInt",
    int: "Int",
  };
  const mismatched = tableColumns.filter((column) => {
    const input = inputs.find((candidate) => candidate.name === lowerFirst(column.name));
    if (input === undefined) return true;
    if (column.type.startsWith("nvarchar")) return input.type !== "NVarChar" || input.length !== column.length;
    if (column.type === "datetime2(3)") return input.type !== "DateTime2" || input.length !== "3";
    return input.type !== expectedType[column.type];
  });

  add(
    "schema: the INSERT names exactly the table's 17 columns",
    tableColumns.length === 17 &&
      JSON.stringify(columns) === JSON.stringify(tableColumns.map((column) => column.name)),
    JSON.stringify(columns),
  );
  add(
    "schema: every value is a parameter of the column's own type and length",
    JSON.stringify(params) === JSON.stringify(tableColumns.map((column) => `@${lowerFirst(column.name)}`)) &&
      inputs.length === 17 &&
      mismatched.length === 0,
    JSON.stringify(mismatched),
  );
  add("schema: nothing is interpolated into the statement", statement !== "" && !statement.includes("${"));
  add(
    "schema: the request timeout is never 0, and the audit insert runs on the pool",
    /Math\.max\(1,/.test(source) && /getPool\(\)/.test(source) && !/inTransaction|Transaction\(/.test(source),
  );
}

/* ------------------------------------------------------------------ report */

const failed = checks.filter((check) => !check.ok);
for (const check of failed) {
  console.error(`FAIL  ${check.name}${check.detail ? `  (${check.detail})` : ""}`);
}
console.log(`check:logging -- ${checks.length - failed.length}/${checks.length} checks passed`);

process.exit(failed.length === 0 ? 0 : 1);
