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
 *   6. the instrumentation hooks -- `app.started` and `next.request_error`;
 *   7-10. the audit records and the D15 writer (S3);
 *   11. the audit step of the API boundary (S4) -- the approved operation on
 *      each of the 14 audited handlers and none on the session routes, outcome
 *      and reason mapping, ids, actor and metadata, one row per request under
 *      concurrency, no audit call near a transaction, and responses unchanged
 *      however the audit write fails;
 *   12. the page-view audit (S5) -- operation, outcome, status, route and
 *      metadata for each page, the host/edit/member views, the default
 *      `error`, the actor and request id captured during the render, no row
 *      for a prefetch, one registration per render, the page untouched by a
 *      failing or hanging write, and a source scan of the three pages.
 *
 * The database and mail call sites (`lib/data/client.ts`,
 * `lib/services/*`) import `server-only` and resolve `@/` paths, which bare
 * Node cannot do, so their log lines are verified on a running server.
 *
 * What it cannot check is the page-render half of the request context, which
 * depends on React scoping `cache()` to a server render, or Next actually
 * running an `after()` callback. Those only exist inside a running Next
 * server, so they are verified there; section 12 checks the page helper with
 * both injected.
 *
 * **Every value here is synthetic.** No real credential, host or person.
 *
 * Node built-ins and the modules under test only, so it runs with bare `node`.
 */

import mssql from "mssql";

import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { readdirSync, readFileSync } from "node:fs";

import { ApiError, jsonError, jsonOk, readJson } from "../lib/api.ts";
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
  availabilityReason,
  closedReason,
  createErrorHandling,
  failureReason,
  outcomeForStatus,
  scheduleReason,
  UNMATCHED_ROUTE,
  withErrorHandling,
  type ApiAuditOperation,
  type AuditRecorder,
} from "../lib/apiHandler.ts";
import { createRedactor } from "../lib/data/redact.mts";
import {
  createPageAudit,
  PAGE_AUDIT_ROUTES,
  PAGE_STATUS,
  PREFETCH_HEADERS,
  type PageAuditDeps,
  type PageAuditOperation,
} from "../lib/pageAudit.ts";
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
  noteAuditEventId,
  noteCommitted,
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
  // The same driver codes, raised while the pool was still connecting -- the
  // insert reports the query as not yet sent -- are definite non-writes. The
  // retry policy is unchanged: ESOCKET is still retried once, ETIMEOUT never.
  const preSend = (props: Record<string, unknown>) => async (attempt: AuditAttempt) => {
    attempt.sent = false;
    throw driverError(props);
  };
  const sentThen = (props: Record<string, unknown>) => async (attempt: AuditAttempt) => {
    attempt.sent = true;
    throw driverError(props);
  };

  const down = scriptedInsert([preSend({ code: "ESOCKET" }), preSend({ code: "ESOCKET" })]);
  const downRun = await captureOutput(() => writeAudit(auditInput(), down.insert));
  const downLine = lineFor(downRun.lines, "audit.write_failed")?.record;
  add(
    "d15: a connect failure before the query (ESOCKET) is retried once, then a definite non-write",
    downRun.result.status === "failed" && down.calls.length === 2 && !downRun.result.ambiguous &&
      downLine?.reason === "connection" && downLine.ambiguous === false,
    JSON.stringify(downLine),
  );

  const slow = scriptedInsert([preSend({ code: "ETIMEOUT" })]);
  const slowRun = await captureOutput(() => writeAudit(auditInput(), slow.insert));
  const slowLine = lineFor(slowRun.lines, "audit.write_failed")?.record;
  add(
    "d15: a connect timeout before the query (ETIMEOUT) is not retried, a connection failure and a definite non-write",
    slowRun.result.status === "failed" && slow.calls.length === 1 && !slowRun.result.ambiguous &&
      slowLine?.reason === "connection" && slowLine.ambiguous === false,
    JSON.stringify(slowLine),
  );

  const sent = scriptedInsert([sentThen({ code: "ETIMEOUT" })]);
  const sentRun = await captureOutput(() => writeAudit(auditInput(), sent.insert));
  const sentLine = lineFor(sentRun.lines, "audit.write_failed")?.record;
  const dropped = scriptedInsert([sentThen({ code: "ESOCKET" }), sentThen({ code: "ESOCKET" })]);
  const droppedRun = await captureOutput(() => writeAudit(auditInput(), dropped.insert));
  add(
    "d15: once the query is sent, a timeout or a dropped connection stays an unknown outcome",
    sentRun.result.ambiguous && sentLine?.reason === "timeout" && sentLine.ambiguous === true &&
      droppedRun.result.ambiguous && dropped.calls.length === 2,
    JSON.stringify(sentLine),
  );

  // The real insert marks the boundary: not sent before getting a connection,
  // sent immediately before the query.
  const insertSource = readFileSync(new URL("../lib/data/audit.ts", import.meta.url), "utf8");
  const body = insertSource.slice(insertSource.indexOf("export async function insertAudit"));
  const notSentAt = body.indexOf("attempt.sent = false;");
  const sentAt = body.indexOf("attempt.sent = true;");
  add(
    "d15: insertAudit marks the query unsent before getting a connection, and sent right before .query",
    notSentAt !== -1 && notSentAt < body.indexOf("await getPool()") &&
      sentAt !== -1 && /^attempt\.sent = true;\s*await request\.query\(INSERT_AUDIT\);/.test(body.slice(sentAt)),
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

/* ------------------------------------ 11. the API audit step (S4) */

/** The approved matrix (M12 plan, E3): method and route pattern to operation. */
const API_AUDIT_MATRIX: Record<string, string> = {
  "POST /api/events": "event.create",
  "PATCH /api/events/[id]": "event.update",
  "DELETE /api/events/[id]": "event.delete",
  "POST /api/events/[id]/publish": "event.publish",
  "POST /api/events/[id]/cancel": "event.cancel",
  "POST /api/events/[id]/registrations": "registration.register",
  "DELETE /api/events/[id]/registrations": "registration.withdraw",
  "POST /api/events/[id]/registrations/[registrationId]/approve": "request.approve",
  "POST /api/events/[id]/registrations/[registrationId]/reject": "request.reject",
  "POST /api/events/[id]/registrations/[registrationId]/remove": "attendee.remove",
  "POST /api/events/[id]/registrations/[registrationId]/restore": "attendee.restore",
  "POST /api/events/[id]/invitations/[userId]": "invitation.add",
  "DELETE /api/events/[id]/invitations/[userId]": "invitation.revoke",
  "POST /api/events/[id]/share-emails/[userId]": "share.email",
};

const routeSources = (readdirSync(new URL("../app/api", import.meta.url), { recursive: true }) as string[])
  .filter((file) => file.endsWith("route.ts"))
  .map((file) => {
    const relative = file.replace(/\\/g, "/");
    const pattern = `/api/${relative.replace(/\/?route\.ts$/, "")}`.replace(/\/$/, "");
    return { pattern, source: readFileSync(new URL(`../app/api/${relative}`, import.meta.url), "utf8") };
  });

{
  // Every exported handler: wrapped exactly once, and audited exactly as the
  // matrix says -- the session routes not at all (D13).
  const found: Record<string, string | null> = {};
  const problems: string[] = [];
  for (const { pattern, source } of routeSources) {
    const exports = [...source.matchAll(/^export const (GET|POST|PATCH|PUT|DELETE) = /gm)];
    exports.forEach((match, index) => {
      const end = exports[index + 1]?.index ?? source.length;
      const segment = source.slice(match.index, end);
      const key = `${match[1]} ${pattern}`;
      if (!segment.startsWith(`export const ${match[1]} = withErrorHandling(`)) problems.push(`${key}: not wrapped`);
      if ((segment.match(/withErrorHandling\(/g) ?? []).length !== 1) problems.push(`${key}: wrapped more than once`);
      const audits = [...segment.matchAll(/\{ audit: "([a-z_.]+)" \}/g)].map((m) => m[1]);
      if (audits.length > 1) problems.push(`${key}: more than one audit option`);
      found[key] = audits[0] ?? null;
    });
  }
  const audited = Object.fromEntries(Object.entries(found).filter(([, op]) => op !== null));
  add(
    "s4: the 14 audited handlers declare exactly the approved operations",
    JSON.stringify(Object.entries(audited).sort()) === JSON.stringify(Object.entries(API_AUDIT_MATRIX).sort()),
    JSON.stringify(audited),
  );
  add(
    "s4: GET and POST /api/session are wrapped and not audited",
    "GET /api/session" in found && "POST /api/session" in found && found["GET /api/session"] === null && found["POST /api/session"] === null,
  );
  add("s4: every handler is wrapped exactly once", problems.length === 0, problems.join("; "));
  add("s4: sixteen wrapped handlers in all", Object.keys(found).length === 16, String(Object.keys(found).length));
  add(
    "s4: no handler is exported in a form the scan above would miss",
    routeSources.every(({ source }) => !/export\s+(async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE|HEAD|OPTIONS)\b|export\s*\{|export\s+const\s+(HEAD|OPTIONS)\b/.test(source)),
  );
}

{
  // Every 409 an audited route throws names its reason, so no refusal falls
  // back to the bare `conflict` code.
  const bare: string[] = [];
  for (const { pattern, source } of routeSources) {
    if (pattern === "/api/session") continue;
    for (const match of source.matchAll(/ApiError\.conflict\(/g)) {
      let depth = 1;
      let index = match.index + match[0].length;
      let commas = 0;
      while (depth > 0 && index < source.length) {
        const char = source[index];
        if ("([{".includes(char)) depth += 1;
        else if (")]}".includes(char)) depth -= 1;
        else if (char === "," && depth === 1) commas += 1;
        index += 1;
      }
      const args = source.slice(match.index + match[0].length, index - 1).trim();
      if (commas === 0 || (commas === 1 && args.endsWith(","))) bare.push(`${pattern}: ${args.slice(0, 40)}`);
    }
  }
  add("s4: every 409 in an audited route carries a reason", bare.length === 0, bare.join("; "));
  add(
    "s4: no 409 is built by hand, where the scan above would not see it",
    routeSources.every(({ source }) => !/new ApiError\(\s*409/.test(source)),
  );
  // A reason decided by `state === "closed"` misses an availability whose other
  // states carry a reason too (`reject_only`, reason `full`); routes use
  // `availabilityReason`, which reads the reason itself.
  add(
    "s4: no route picks a refusal reason by testing for the closed state",
    routeSources.every(({ source }) => !/state === "closed"\s*\?\s*closedReason\(/.test(source)),
  );
}

{
  // Audit and commit notes stay out of the data layer, and no route opens a
  // transaction: the audit write cannot land inside one.
  const dataDir = new URL("../lib/data/", import.meta.url);
  const dataFiles = (readdirSync(dataDir, { recursive: true }) as string[]).filter(
    (file) => /\.m?ts$/.test(file) && !file.endsWith("audit.ts"),
  );
  const inData = dataFiles.filter((file) =>
    /noteCommitted|noteAuditEventId|writeAudit|insertAudit|audit\.record|apiHandler/.test(readFileSync(new URL(file, dataDir), "utf8")),
  );
  const inRoutes = routeSources.filter(({ source }) => /inTransaction|sql\.Transaction|BEGIN TRAN/i.test(source));
  add("s4: no audit call or note anywhere in lib/data (so none inside inTransaction)", inData.length === 0, inData.join(", "));
  add("s4: no route handler opens a transaction", inRoutes.length === 0, inRoutes.map((route) => route.pattern).join(", "));

  // A commit note sits on the success path, right after the write it reports:
  // the nearest data call before it is a *write* (not a read such as
  // `db.registrations.get`), and the very next statement returns the success
  // response, so no refusal or failure can follow it.
  const WRITES = new Set([
    "db.events.create",
    "db.events.update",
    "db.events.remove",
    "db.events.invite",
    "db.events.revokeInvitation",
    "db.registrations.claimSeat",
    "db.registrations.update",
    "db.registrations.approve",
    "db.registrations.restore",
    "sendEventShareEmail",
  ]);
  const misplaced: string[] = [];
  let notes = 0;
  for (const { pattern, source } of routeSources) {
    if (pattern === "/api/session") continue;
    for (const match of source.matchAll(/noteCommitted\(\);/g)) {
      notes += 1;
      const calls = [...source.slice(0, match.index).matchAll(/await (db\.[A-Za-z.]+|sendEventShareEmail)\(/g)];
      const nearest = calls.at(-1)?.[1];
      const next = source.slice(match.index + match[0].length);
      if (nearest === undefined || !WRITES.has(nearest)) misplaced.push(`${pattern}: after ${nearest}`);
      if (!/^\s*return jsonOk\(/.test(next)) misplaced.push(`${pattern}: not followed by the success return`);
    }
  }
  add(
    "s4: every commit note follows its write and is followed by the success return",
    notes === 14 && misplaced.length === 0,
    `${notes} notes; ${misplaced.join("; ")}`,
  );
}

{
  const reasons: Array<[string, string]> = [
    [closedReason("full"), "full"],
    [closedReason("not_invited"), "not_invited"],
    [closedReason("already_invited"), "already_invited"],
    [closedReason("draft"), "closed:draft"],
    [closedReason("open_access"), "closed:open_access"],
    [availabilityReason({ state: "reject_only", reason: "full" }), "full"],
    [availabilityReason({ state: "closed", reason: "full" }), "full"],
    [availabilityReason({ state: "closed", reason: "not_decidable" }), "closed:not_decidable"],
    [availabilityReason({ state: "open" }), "stale"],
    [availabilityReason({ state: "approve_only" }), "stale"],
    [scheduleReason({ startsAt: "started" }), "schedule_locked"],
    [scheduleReason({ endsAt: "cancelled" }), "schedule_locked"],
    [scheduleReason({ startsAt: "start_not_future" }), "validation"],
    [failureReason(Object.assign(new Error("x"), { number: 1205 })), "deadlock"],
    [failureReason(Object.assign(new Error("x"), { originalError: { number: 1205 } })), "deadlock"],
    [failureReason(Object.assign(new Error("x"), { number: 40613 })), "db_unavailable"],
    [failureReason(Object.assign(new Error("x"), { code: "ESOCKET" })), "db_unavailable"],
    [failureReason(Object.assign(new Error("x"), { code: "ETIMEOUT" })), "db_unavailable"],
    [failureReason(Object.assign(new Error("x"), { number: 547 })), "internal"],
    [failureReason(new TypeError("x")), "internal"],
    [failureReason("not an error"), "internal"],
  ];
  const wrong = reasons.filter(([actual, expected]) => actual !== expected);
  add("s4: refusal, schedule and failure reasons map to the approved codes", wrong.length === 0, JSON.stringify(wrong));
  add(
    "s4: every reason code fits the audit format",
    reasons.every(([code]) => /^[a-z0-9_:.-]{1,64}$/.test(code)),
  );

  const statuses: Array<[number, string]> = [
    [200, "success"], [201, "success"], [400, "invalid"], [403, "denied"], [404, "not_found"],
    [409, "rejected"], [500, "error"], [502, "error"], [503, "error"],
  ];
  const wrongStatus = statuses.filter(([status, outcome]) => outcomeForStatus(status) !== outcome);
  add("s4: HTTP status maps to the approved outcome", wrongStatus.length === 0, JSON.stringify(wrongStatus));
}

/** The second argument Next passes a dynamic route's handler. */
type RouteArgs = { params: Promise<Record<string, string>> };

/** A wrapper with a recorder the checks can read, as the application's would be with the database. */
function auditedWrapper(recorder?: AuditRecorder) {
  const records: AuditInput[] = [];
  const record: AuditRecorder = recorder ?? (async (input) => {
    records.push(input);
  });
  return { wrap: createErrorHandling(record), records };
}

const S4_EVENT = "7A1B2C3D-1111-4222-8333-444455556666";
const S4_REGISTRATION = "8b1b2c3d-1111-4222-8333-444455556666";
const S4_USER = "9c1b2c3d-1111-4222-8333-444455556666";
const S4_ACTOR = { id: "ab1b2c3d-1111-4222-8333-444455556666", name: "Synthetic Audited Person" };

/** Runs one audited call and returns its response, records and log lines. */
async function auditedCall(
  operation: ApiAuditOperation,
  path: string,
  params: Record<string, string>,
  body: (request: Request) => Promise<Response>,
  options: { method?: string; recorder?: AuditRecorder; requestId?: string; init?: RequestInit } = {},
) {
  const { wrap, records } = auditedWrapper(options.recorder);
  const handler = wrap<[Request, RouteArgs]>(async (request) => body(request), { audit: operation });
  const requestId = options.requestId ?? newRequestId();
  const request = new Request(`http://localhost${path}`, {
    method: options.method ?? "POST",
    headers: { [REQUEST_ID_HEADER]: requestId },
    ...options.init,
  });
  const { result, lines } = await captureOutput(() => handler(request, { params: Promise.resolve(params) }));
  return { response: result, text: await result.text(), records, lines, requestId };
}

const s4Lines: Captured[] = [];

{
  const call = await auditedCall(
    "request.approve",
    `/api/events/${S4_EVENT}/registrations/${S4_REGISTRATION}/approve`,
    { id: S4_EVENT, registrationId: S4_REGISTRATION },
    async () => {
      noteActor(S4_ACTOR, false);
      noteCommitted();
      return jsonOk({ ok: true });
    },
  );
  s4Lines.push(...call.lines);
  const row = call.records[0];
  add("s4: a successful audited call records exactly one row", call.records.length === 1);
  add(
    "s4: the row carries the request, actor, route, method, ids and outcome",
    row !== undefined &&
      row.requestId === call.requestId &&
      row.channel === "api" &&
      row.httpMethod === "POST" &&
      row.route === "/api/events/:id/registrations/:registrationId/approve" &&
      row.operation === "request.approve" &&
      row.actor?.userId === S4_ACTOR.id &&
      row.actor.name === S4_ACTOR.name &&
      row.eventId === S4_EVENT.toLowerCase() &&
      row.subject?.type === "registration" &&
      row.subject.id === S4_REGISTRATION &&
      row.outcome === "success" &&
      row.httpStatus === 200 &&
      row.reasonCode === null &&
      Number.isInteger(row.durationMs) &&
      row.occurredAt instanceof Date &&
      row.metadata !== null && Object.keys(row.metadata ?? {}).length === 0,
    JSON.stringify(row),
  );
  add("s4: the record passes the writer's own checks", row !== undefined && toAuditRow(row, newRequestId()).ok);
}

{
  const call = await auditedCall("invitation.add", `/api/events/${S4_EVENT}/invitations/${S4_USER}`, { id: S4_EVENT, userId: S4_USER }, async () =>
    jsonOk({ invitation: true }, 201),
  );
  const row = call.records[0];
  add(
    "s4: a [userId] route records a user subject, and no actor when none was resolved",
    row?.subject?.type === "user" && row.subject.id === S4_USER && row.actor === null && row.outcome === "success" && row.httpStatus === 201,
    JSON.stringify(row),
  );
}

{
  const created = "cd1b2c3d-1111-4222-8333-444455556666";
  const call = await auditedCall("event.create", "/api/events", {}, async () => {
    noteAuditEventId(created);
    noteCommitted();
    return jsonOk({ event: { id: created } }, 201);
  });
  const row = call.records[0];
  add("s4: event.create records the id of the event it created", row?.eventId === created && row.subject === null, JSON.stringify(row));

  const refused = await auditedCall("event.create", "/api/events", {}, async () => {
    throw ApiError.forbidden();
  });
  add(
    "s4: event.create refused before anything exists records no event id",
    refused.records[0]?.eventId === null && refused.records[0]?.outcome === "denied" && refused.records[0]?.reasonCode === "forbidden",
    JSON.stringify(refused.records[0]),
  );
}

{
  const call = await auditedCall(
    "attendee.remove",
    "/api/events/not-a-uuid/registrations/<script>/remove",
    { id: "not-a-uuid", registrationId: "<script>" },
    async () => {
      throw ApiError.notFound();
    },
  );
  const row = call.records[0];
  add(
    "s4: ids that are not UUIDs become NULL, and the row is still written",
    row?.eventId === null && row.subject === null && row.outcome === "not_found" && row.reasonCode === "not_found" && row.httpStatus === 404,
    JSON.stringify(row),
  );
}

{
  // Each refusal kind: outcome, status and reason, and a response that is
  // exactly what it was before S4.
  const cases: Array<[string, () => never, string, number, string]> = [
    ["409 with a reason", () => { throw ApiError.conflict("full", "full"); }, "rejected", 409, "full"],
    ["409 closed", () => { throw ApiError.conflict("closed", closedReason("draft")); }, "rejected", 409, "closed:draft"],
    ["409 without a reason", () => { throw ApiError.conflict("x"); }, "rejected", 409, "conflict"],
    ["403 not invited", () => { throw ApiError.forbidden("no", "not_invited"); }, "denied", 403, "not_invited"],
    ["404 gone", () => { throw ApiError.notFound(undefined, "gone"); }, "not_found", 404, "gone"],
    ["503 email", () => { throw new ApiError(503, "x", { code: "email_not_configured" }); }, "error", 503, "email_not_configured"],
    ["502 email", () => { throw new ApiError(502, "x", { code: "email_delivery_failed" }); }, "error", 502, "email_delivery_failed"],
    ["500 render", () => { throw new ApiError(500, "x", { code: "email_render_failed" }); }, "error", 500, "email_render_failed"],
    ["500 unhandled", () => { throw new Error("boom"); }, "error", 500, "internal"],
    ["500 deadlock", () => { throw Object.assign(new Error("deadlock victim"), { number: 1205 }); }, "error", 500, "deadlock"],
  ];
  const wrong: string[] = [];
  const responseChanged: string[] = [];
  for (const [name, fail, outcome, status, reason] of cases) {
    const audited = await auditedCall("event.publish", `/api/events/${S4_EVENT}/publish`, { id: S4_EVENT }, async () => fail());
    s4Lines.push(...audited.lines);
    const plain = withErrorHandling<[Request]>(async () => fail());
    const { result } = await captureOutput(() => plain(apiRequest(`/api/events/${S4_EVENT}/publish`, newRequestId())));
    const row = audited.records[0];
    if (audited.records.length !== 1 || row?.outcome !== outcome || row.httpStatus !== status || row.reasonCode !== reason) {
      wrong.push(`${name}: ${JSON.stringify(row)}`);
    }
    const headers = (response: Response) => JSON.stringify([...response.headers].sort());
    if (
      audited.response.status !== result.status ||
      headers(audited.response) !== headers(result) ||
      audited.text !== (await result.text())
    ) {
      responseChanged.push(name);
    }
  }
  add("s4: each refusal and failure records the approved outcome, status and reason", wrong.length === 0, wrong.join(" | "));
  add("s4: auditing changes no response, status, header or body", responseChanged.length === 0, responseChanged.join(", "));
  add(
    "s4: the reason never reaches the response body",
    !(await auditedCall("event.cancel", "/api/events/x/cancel", {}, async () => {
      throw ApiError.conflict("msg", "closed:started");
    })).text.includes("closed:started"),
  );
}

{
  const call = await auditedCall("event.update", `/api/events/${S4_EVENT}`, { id: S4_EVENT }, async () => {
    throw ApiError.badRequest("rejected", { title: "Synthetic message text", endsAt: "Another message" }, "validation");
  }, { method: "PATCH" });
  const row = call.records[0];
  add(
    "s4: a validation 400 records the field names only, never the messages",
    row?.outcome === "invalid" &&
      row.reasonCode === "validation" &&
      JSON.stringify(row.metadata) === JSON.stringify({ fieldErrors: ["title", "endsAt"] }) &&
      !JSON.stringify(row).includes("Synthetic message text"),
    JSON.stringify(row),
  );

  const malformed = await auditedCall(
    "event.update",
    `/api/events/${S4_EVENT}`,
    { id: S4_EVENT },
    async (request) => {
      await readJson(request);
      return jsonOk({});
    },
    { method: "PATCH", init: { method: "PATCH", body: "{not json" } },
  );
  add(
    "s4: a malformed body records invalid_json",
    malformed.records[0]?.outcome === "invalid" && malformed.records[0].reasonCode === "invalid_json" && malformed.response.status === 400,
    JSON.stringify(malformed.records[0]),
  );
}

{
  const fallback = await auditedCall("registration.register", `/api/events/${S4_EVENT}/registrations`, { id: S4_EVENT }, async () => {
    noteActor(S4_ACTOR, true);
    return jsonOk({});
  });
  add(
    "s4: a fallback persona is recorded with actorFallback, and no subject for one's own registration",
    fallback.records[0]?.actor?.userId === S4_ACTOR.id &&
      JSON.stringify(fallback.records[0].metadata) === JSON.stringify({ actorFallback: true }) &&
      fallback.records[0].subject === null,
    JSON.stringify(fallback.records[0]),
  );
}

{
  const call = await auditedCall("registration.withdraw", `/api/events/${S4_EVENT}/registrations`, { id: S4_EVENT }, async () => {
    noteActor(S4_ACTOR, false);
    noteCommitted();
    throw new Error("failed after the write");
  }, { method: "DELETE" });
  s4Lines.push(...call.lines);
  add(
    "s4: a failure after the commit note records post_commit_error",
    call.records[0]?.outcome === "error" && call.records[0].reasonCode === "post_commit_error" && call.response.status === 500,
    JSON.stringify(call.records[0]),
  );

  const before = await auditedCall("registration.withdraw", `/api/events/${S4_EVENT}/registrations`, { id: S4_EVENT }, async () => {
    throw new Error("failed before any write");
  }, { method: "DELETE" });
  add("s4: a failure before any commit is an ordinary error, never a success", before.records[0]?.outcome === "error" && before.records[0].reasonCode === "internal");
}

{
  // The session routes declare no operation: no row, whatever happens.
  const { wrap, records } = auditedWrapper();
  const ok = wrap<[Request]>(async () => jsonOk({}));
  const fail = wrap<[Request]>(async () => {
    throw ApiError.badRequest("x");
  });
  await captureOutput(() => ok(apiRequest("/api/session", newRequestId(), "GET")));
  await captureOutput(() => fail(apiRequest("/api/session", newRequestId())));
  add("s4: a handler without an audit option records nothing", records.length === 0);
}

{
  // Twenty concurrent requests, each with its own actor and event: each row
  // belongs to its own request, and there is exactly one per request.
  const { wrap, records } = auditedWrapper();
  const handler = wrap<[Request, RouteArgs]>(
    async (request) => {
      const index = Number(new URL(request.url).searchParams.get("n"));
      await tick(Math.floor(Math.random() * 8));
      noteActor({ id: `${String(index).padStart(8, "0")}-1111-4222-8333-444455556666`, name: `Person ${index}` }, false);
      await tick(Math.floor(Math.random() * 8));
      if (index % 3 === 0) throw ApiError.conflict("full", "full");
      return jsonOk({});
    },
    { audit: "registration.register" },
  );
  const calls = Array.from({ length: 20 }, (_, index) => {
    const requestId = newRequestId();
    const eventId = `${String(index).padStart(8, "0")}-aaaa-4222-8333-444455556666`;
    const request = new Request(`http://localhost/api/events/${eventId}/registrations?n=${index}`, {
      method: "POST",
      headers: { [REQUEST_ID_HEADER]: requestId },
    });
    return { index, requestId, eventId, promise: handler(request, { params: Promise.resolve({ id: eventId }) }) };
  });
  await captureOutput(() => Promise.all(calls.map((call) => call.promise)));
  const crossed = calls.filter(({ index, requestId, eventId }) => {
    const mine = records.filter((row) => row.requestId === requestId);
    const row = mine[0];
    return (
      mine.length !== 1 ||
      row.eventId !== eventId ||
      row.actor?.name !== `Person ${index}` ||
      row.outcome !== (index % 3 === 0 ? "rejected" : "success")
    );
  });
  add(
    "s4: twenty concurrent requests give twenty rows, each with its own id, actor, event and outcome",
    records.length === 20 && new Set(records.map((row) => row.requestId)).size === 20 && crossed.length === 0,
    JSON.stringify(crossed.map((call) => call.index)),
  );
}

{
  // A slow audit write is not part of DurationMs, and the response waits for it.
  let handlerDone = 0;
  let recordStarted = 0;
  const call = await auditedCall("event.delete", `/api/events/${S4_EVENT}`, { id: S4_EVENT }, async () => {
    handlerDone = performance.now();
    return jsonOk({ deleted: true });
  }, {
    method: "DELETE",
    recorder: async () => {
      recordStarted = performance.now();
      await tick(150);
    },
  });
  void call;
  let timedRow: AuditInput | undefined;
  const started = performance.now();
  const timed = await auditedCall("event.delete", `/api/events/${S4_EVENT}`, { id: S4_EVENT }, async () => jsonOk({ deleted: true }), {
    method: "DELETE",
    recorder: async (input) => {
      await tick(400);
      timedRow = input;
    },
  });
  const elapsed = performance.now() - started;
  add(
    "s4: DurationMs is handler time and leaves out the audit write",
    // Relative, not absolute: the handler is instant and the write takes
    // 400 ms, so DurationMs must sit far below the time the call took.
    timedRow !== undefined &&
      timedRow.durationMs !== null &&
      timedRow.durationMs !== undefined &&
      timedRow.durationMs + 300 <= elapsed &&
      elapsed >= 390 &&
      timed.response.status === 200,
    JSON.stringify({ durationMs: timedRow?.durationMs, elapsed }),
  );
  add("s4: the audit write starts only after the handler has finished", recordStarted >= handlerDone && handlerDone > 0);
}

{
  // The recorder failing in every way leaves the response exactly as it was.
  const expected = await jsonOk({ registration: "kept" }).text();
  const body = async () => jsonOk({ registration: "kept" });
  const path = `/api/events/${S4_EVENT}/registrations`;

  const rejects = await auditedCall("registration.register", path, { id: S4_EVENT }, async () => {
    noteActor(S4_ACTOR, false);
    return body();
  }, {
    recorder: async () => {
      throw new Error(`recorder broke for ${S4_ACTOR.name}`);
    },
  });
  s4Lines.push(...rejects.lines);
  const bug = rejects.lines.find((line) => line.record?.event === "audit.write_failed");
  add("s4: a recorder that throws leaves the response unchanged", rejects.response.status === 200 && rejects.text === expected);
  add(
    "s4: ...and logs audit.write_failed (writer_bug) with no actor and no message",
    bug?.record?.reason === "writer_bug" && bug.record.requestId === rejects.requestId && !bug.text.includes(S4_ACTOR.name) && !bug.text.includes("recorder broke"),
    bug?.text,
  );

  const sqlFailure = await auditedCall("registration.register", path, { id: S4_EVENT }, body, {
    recorder: (input) => writeAudit(input, async () => {
      throw Object.assign(new Error("Invalid object name 'dbo.Events_AuditLog'."), { number: 208 });
    }),
  });
  s4Lines.push(...sqlFailure.lines);
  add(
    "s4: a failing insert (missing table, 208) leaves the response unchanged and logs sql_error",
    sqlFailure.response.status === 200 &&
      sqlFailure.text === expected &&
      sqlFailure.lines.some((line) => line.record?.event === "audit.write_failed" && line.record.reason === "sql_error"),
    sqlFailure.lines.map((line) => line.text).join(""),
  );

  const started = performance.now();
  const hung = await auditedCall("registration.register", path, { id: S4_EVENT }, body, {
    recorder: (input) => writeAudit(input, () => new Promise<void>(() => undefined)),
  });
  const elapsed = performance.now() - started;
  s4Lines.push(...hung.lines);
  add(
    "s4: a hung insert is cut off at the D15 deadline and the response is unchanged",
    hung.response.status === 200 &&
      hung.text === expected &&
      elapsed >= AUDIT_WRITE_POLICY.deadlineMs - 5 &&
      elapsed < AUDIT_WRITE_POLICY.deadlineMs + 1000 &&
      hung.lines.some((line) => line.record?.event === "audit.write_failed" && line.record.reason === "deadline" && line.record.ambiguous === true),
    JSON.stringify({ elapsed: Math.round(elapsed) }),
  );
}

{
  // The application log never carries the actor or the ids an audit row holds.
  const leaked = s4Lines.filter((line) =>
    [S4_ACTOR.name, S4_ACTOR.id, S4_REGISTRATION, S4_EVENT, S4_EVENT.toLowerCase(), S4_USER].some((value) => line.text.includes(value)),
  );
  add("s4: no actor, name or audited id in any application log line", s4Lines.length > 0 && leaked.length === 0, leaked.map((line) => line.text).join(""));
}

{
  // `audit.written` at debug, in a process of its own so the level can be set.
  const input = JSON.stringify(auditInput());
  const script = `
    import { writeAudit } from ${JSON.stringify(new URL("../lib/audit.ts", import.meta.url).href)};
    const input = JSON.parse(${JSON.stringify(input)});
    input.occurredAt = new Date(input.occurredAt);
    await writeAudit(input, async () => undefined);
  `;
  const run = (level: string) =>
    spawnSync(process.execPath, ["--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "--input-type=module", "-e", script], {
      env: { ...process.env, LOG_LEVEL: level, LOG_FORMAT: "json" },
      encoding: "utf8",
    });
  const debug = run("debug");
  const info = run("info");
  const line = debug.stdout.split("\n").filter(Boolean).map((text) => parse({ stream: "stdout", text }))
    .find((record) => record?.event === "audit.written");
  add(
    "s4: a successful write logs audit.written at debug, with attempts and elapsed time only",
    line?.level === "debug" &&
      line.attempts === 1 &&
      typeof line.durationMs === "number" &&
      line.component === "audit" &&
      !debug.stdout.includes(AUDIT_ACTOR.name) &&
      !debug.stdout.includes(AUDIT_ACTOR.userId) &&
      !debug.stdout.includes(AUDIT_EVENT),
    debug.stdout + debug.stderr,
  );
  add("s4: ...and nothing at the default level", info.status === 0 && !info.stdout.includes("audit.written"), info.stdout + info.stderr);
}

/* ------------------------------------------- 12. the page-view audit (S5) */

/** A page render with Next and the database replaced: what it registered and what it wrote. */
function pageHarness(
  headers: Record<string, string> = {},
  record: PageAuditDeps["record"] = async () => undefined,
) {
  const callbacks: Array<() => Promise<void>> = [];
  const written: AuditInput[] = [];
  let headerReads = 0;
  const beginPageAudit = createPageAudit({
    after: (callback) => {
      callbacks.push(callback);
    },
    readHeaders: async () => {
      headerReads += 1;
      return new Headers(headers);
    },
    record: async (input) => {
      written.push(input);
      return record(input);
    },
  });
  return {
    beginPageAudit,
    callbacks,
    written,
    headerReads: () => headerReads,
    /** Runs what Next would run once the response has been sent. */
    flush: async () => {
      for (const callback of callbacks) await callback();
    },
  };
}

const PAGE_REQUEST_ID = "5e1f0c2b-7a3d-4c6e-9f80-1a2b3c4d5e6f";
const PAGE_HEADERS = { [REQUEST_ID_HEADER]: PAGE_REQUEST_ID };

/** One page render inside a request context of its own, flushed; returns the single row. */
async function renderPage(
  operation: PageAuditOperation,
  page: (audit: Awaited<ReturnType<ReturnType<typeof createPageAudit>>>) => void,
  options: { headers?: Record<string, string>; actor?: { fallback: boolean } | null } = {},
) {
  const harness = pageHarness(options.headers ?? PAGE_HEADERS);
  await runWithRequestContext(newRequestId(), async () => {
    const audit = await harness.beginPageAudit(operation);
    // The actor is noted after the helper started, as `AppShell` or the page
    // resolving the user would.
    if (options.actor !== null) noteActor({ id: AUDIT_ACTOR.userId, name: AUDIT_ACTOR.name }, options.actor?.fallback ?? false);
    page(audit);
  });
  await harness.flush();
  return { harness, row: harness.written[0] };
}

const validRow = (input: AuditInput | undefined) => input !== undefined && toAuditRow(input, newRequestId()).ok;

{
  // The default: nothing decided -- a render that threw -- is `error`.
  const { harness, row } = await renderPage("event.view", (audit) => audit.forEvent(AUDIT_EVENT));
  add(
    "s5: a render that sets no outcome is recorded as error, 500, no reason",
    harness.written.length === 1 &&
      row?.outcome === "error" &&
      row.httpStatus === 500 &&
      (row.reasonCode ?? null) === null &&
      row.eventId === AUDIT_EVENT &&
      validRow(row),
    JSON.stringify(row),
  );
  add(
    "s5: the row is a page row: GET, fixed route pattern, page channel, the proxy's request id",
    row?.channel === "page" &&
      row.httpMethod === "GET" &&
      row.route === "/events/:id" &&
      row.operation === "event.view" &&
      row.requestId === PAGE_REQUEST_ID &&
      row.subject === null &&
      Number.isInteger(row.durationMs) &&
      (row.durationMs ?? -1) >= 0 &&
      row.occurredAt instanceof Date,
    JSON.stringify(row),
  );
  add(
    "s5: the actor noted during the render reaches the row, read from the captured context",
    row?.actor?.userId === AUDIT_ACTOR.userId && row.actor.name === AUDIT_ACTOR.name && row.metadata?.actorFallback === undefined,
    JSON.stringify(row?.actor),
  );
  add("s5: the headers are read once, during the render, never in the callback", harness.headerReads() === 1, String(harness.headerReads()));
}

{
  const routes = Object.entries(PAGE_AUDIT_ROUTES);
  add(
    "s5: exactly the three approved page operations, each with its fixed pattern",
    JSON.stringify(routes) ===
      JSON.stringify([
        ["board.view", "/events"],
        ["event.view", "/events/:id"],
        ["event.create_form.view", "/events/new"],
      ]),
    JSON.stringify(routes),
  );
  add(
    "s5: statuses: success 200; not_found, invalid and denied 404 (the page's 404); error 500",
    JSON.stringify(PAGE_STATUS) === JSON.stringify({ success: 200, not_found: 404, invalid: 404, denied: 404, error: 500 }),
    JSON.stringify(PAGE_STATUS),
  );
}

{
  // The board: section and parsed filters; empty filters are left out.
  const filtered = await renderPage("board.view", (audit) =>
    audit.success({ section: "past", filters: { category: "social", access: "invite" } }),
  );
  const plain = await renderPage("board.view", (audit) => audit.success({ section: "upcoming", filters: {} }));
  add(
    "s5: board.view success records the section and the filters",
    filtered.row?.outcome === "success" &&
      filtered.row.httpStatus === 200 &&
      filtered.row.route === "/events" &&
      filtered.row.eventId === null &&
      JSON.stringify(filtered.row.metadata) === JSON.stringify({ section: "past", filters: { category: "social", access: "invite" } }) &&
      validRow(filtered.row),
    JSON.stringify(filtered.row),
  );
  add(
    "s5: board.view with no filters records the section only",
    JSON.stringify(plain.row?.metadata) === JSON.stringify({ section: "upcoming" }),
    JSON.stringify(plain.row?.metadata),
  );
}

{
  // The detail page: host, edit and member views.
  const id = AUDIT_EVENT.toUpperCase();
  const host = await renderPage("event.view", (audit) => {
    audit.forEvent(id);
    audit.success({ view: "host" });
  });
  const edit = await renderPage("event.view", (audit) => {
    audit.forEvent(id);
    audit.success({ view: "edit" });
  });
  const member = await renderPage("event.view", (audit) => {
    audit.forEvent(id);
    audit.success({ view: undefined });
  });
  add(
    "s5: event.view as a manager records view host, with the event id lower-cased",
    host.row?.outcome === "success" && host.row.metadata?.view === "host" && host.row.eventId === AUDIT_EVENT && validRow(host.row),
    JSON.stringify(host.row),
  );
  add("s5: event.view in edit mode records view edit", edit.row?.metadata?.view === "edit" && validRow(edit.row), JSON.stringify(edit.row));
  add(
    "s5: event.view as a member records no view",
    member.row?.outcome === "success" && member.row.metadata?.view === undefined && member.row.eventId === AUDIT_EVENT,
    JSON.stringify(member.row),
  );
}

{
  // Not found, and an id that is not an id.
  const missing = await renderPage("event.view", (audit) => {
    audit.forEvent(AUDIT_EVENT);
    audit.notFound();
  });
  const invalid = await renderPage("event.view", (audit) => {
    audit.forEvent("not-an-id<script>");
    audit.notFound();
  });
  add(
    "s5: a missing, hidden or deleted event is not_found, 404, with the requested id",
    missing.row?.outcome === "not_found" &&
      missing.row.httpStatus === 404 &&
      (missing.row.reasonCode ?? null) === null &&
      missing.row.eventId === AUDIT_EVENT &&
      validRow(missing.row),
    JSON.stringify(missing.row),
  );
  add(
    "s5: an id that is not a UUID is invalid with reason invalid_id, 404, and no event id",
    invalid.row?.outcome === "invalid" &&
      invalid.row.httpStatus === 404 &&
      invalid.row.reasonCode === "invalid_id" &&
      invalid.row.eventId === null &&
      !JSON.stringify(invalid.row).includes("script") &&
      validRow(invalid.row),
    JSON.stringify(invalid.row),
  );
}

{
  // The create form.
  const denied = await renderPage("event.create_form.view", (audit) => audit.denied());
  const allowed = await renderPage("event.create_form.view", (audit) => audit.success());
  add(
    "s5: event.create_form.view refused is denied, 404",
    denied.row?.outcome === "denied" && denied.row.httpStatus === 404 && denied.row.route === "/events/new" && validRow(denied.row),
    JSON.stringify(denied.row),
  );
  add(
    "s5: event.create_form.view allowed is success, 200, no metadata beyond none",
    allowed.row?.outcome === "success" && allowed.row.httpStatus === 200 && JSON.stringify(allowed.row.metadata) === "{}",
    JSON.stringify(allowed.row),
  );
}

{
  // The last call wins; a later refusal drops the earlier success's metadata.
  const { row } = await renderPage("event.view", (audit) => {
    audit.forEvent(AUDIT_EVENT);
    audit.success({ view: "host" });
    audit.notFound();
  });
  add("s5: the last outcome call wins and carries only its own metadata", row?.outcome === "not_found" && row.metadata?.view === undefined, JSON.stringify(row));
}

{
  // The actor: the default-persona fallback, and no actor at all.
  const fallback = await renderPage("board.view", (audit) => audit.success({ section: "upcoming" }), { actor: { fallback: true } });
  const none = await renderPage("board.view", () => undefined, { actor: null });
  add("s5: a default-persona render records actorFallback", fallback.row?.metadata?.actorFallback === true, JSON.stringify(fallback.row?.metadata));
  add("s5: a render that resolved no user records no actor", none.row?.actor === null && validRow(none.row), JSON.stringify(none.row));
}

{
  // Request ids: the proxy's, or a fresh one -- never a client's arbitrary value.
  const missing = await renderPage("board.view", () => undefined, { headers: {} });
  const forged = await renderPage("board.view", () => undefined, { headers: { [REQUEST_ID_HEADER]: "client-chosen" } });
  const upper = await renderPage("board.view", () => undefined, { headers: { [REQUEST_ID_HEADER]: PAGE_REQUEST_ID.toUpperCase() } });
  add(
    "s5: a missing or malformed request id is replaced by a fresh one",
    isRequestId(missing.row?.requestId) && isRequestId(forged.row?.requestId) && forged.row?.requestId !== "client-chosen",
    `${missing.row?.requestId} ${forged.row?.requestId}`,
  );
  add("s5: the proxy's request id is kept, lower-cased", upper.row?.requestId === PAGE_REQUEST_ID, upper.row?.requestId);
}

{
  // Prefetches write nothing; genuine navigations still do.
  const skipped: string[] = [];
  for (const name of PREFETCH_HEADERS) {
    const harness = pageHarness({ ...PAGE_HEADERS, [name]: "1" });
    await runWithRequestContext(newRequestId(), async () => {
      const audit = await harness.beginPageAudit("board.view");
      audit.success({ section: "upcoming" });
    });
    await harness.flush();
    if (harness.callbacks.length === 0 && harness.written.length === 0) skipped.push(name);
  }
  add("s5: a request with either prefetch header registers nothing and writes nothing", skipped.length === PREFETCH_HEADERS.length, skipped.join(","));

  const navigation = await renderPage("board.view", (audit) => audit.success({ section: "upcoming" }), {
    headers: { ...PAGE_HEADERS, rsc: "1", "next-router-state-tree": "%5B%5D" },
  });
  add("s5: a client-side navigation (an RSC request, not a prefetch) is still recorded", navigation.harness.written.length === 1, JSON.stringify(navigation.row));
}

{
  // One row per render: a second call in the same render registers nothing.
  const harness = pageHarness(PAGE_HEADERS);
  await runWithRequestContext(newRequestId(), async () => {
    const first = await harness.beginPageAudit("event.view");
    const second = await harness.beginPageAudit("event.view");
    first.success({ view: "host" });
    second.denied();
  });
  await harness.flush();
  add(
    "s5: one after() registration and one row per render, from the first call",
    harness.callbacks.length === 1 && harness.written.length === 1 && harness.written[0]?.outcome === "success",
    JSON.stringify(harness.written),
  );

  // Two renders at once each get their own row, actor and request id.
  const both = pageHarness(PAGE_HEADERS);
  const other = { id: "0b6f7c8d-9e0a-4b1c-8d2e-3f4a5b6c7d8e", name: "Second Synthetic Name" };
  await Promise.all([
    runWithRequestContext(newRequestId(), async () => {
      const audit = await both.beginPageAudit("board.view");
      await new Promise((resolve) => setTimeout(resolve, 5));
      noteActor({ id: AUDIT_ACTOR.userId, name: AUDIT_ACTOR.name }, false);
      audit.success({ section: "upcoming" });
    }),
    runWithRequestContext(newRequestId(), async () => {
      const audit = await both.beginPageAudit("board.view");
      noteActor(other, false);
      audit.success({ section: "past" });
    }),
  ]);
  await both.flush();
  const pairs = both.written.map((row) => `${row.actor?.name}:${row.metadata?.section}`).sort();
  add(
    "s5: concurrent renders never share an actor or an outcome",
    JSON.stringify(pairs) === JSON.stringify([`${AUDIT_ACTOR.name}:upcoming`, `${other.name}:past`].sort()),
    JSON.stringify(pairs),
  );
}

{
  // The registration is awaited, so it happens while the page renders.
  let registered = false;
  const beginPageAudit = createPageAudit({
    after: async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      registered = true;
    },
    readHeaders: async () => new Headers(PAGE_HEADERS),
    record: async () => undefined,
  });
  await runWithRequestContext(newRequestId(), () => beginPageAudit("board.view"));
  add("s5: beginPageAudit resolves only once after() has been registered", registered);
}

{
  // A registration that fails -- Next's `after` or `headers()` throwing --
  // leaves the page rendering, unaudited, and is logged.
  const failing = (part: "after" | "headers") =>
    createPageAudit({
      after: () => {
        if (part === "after") throw new Error("synthetic after failure");
      },
      readHeaders: async () => {
        if (part === "headers") throw new Error("synthetic headers failure");
        return new Headers(PAGE_HEADERS);
      },
      record: async () => undefined,
    });
  const results: string[] = [];
  for (const part of ["after", "headers"] as const) {
    const { result, lines } = await captureOutput(() =>
      runWithRequestContext(newRequestId(), async () => {
        const audit = await failing(part)("board.view");
        audit.success({ section: "upcoming" });
        return "rendered";
      }),
    );
    const line = lines.find((entry) => entry.record?.event === "audit.write_failed")?.record;
    if (result === "rendered" && line?.reason === "writer_bug" && line.op === "board.view") results.push(part);
  }
  add("s5: a failed registration (after or headers) never fails the page, and is logged", results.length === 2, results.join(","));

  // ...but Next's own signals pass through, so rendering decisions are Next's.
  const signal = Object.assign(new Error("Dynamic server usage"), { digest: "DYNAMIC_SERVER_USAGE" });
  const passing = createPageAudit({
    after: () => undefined,
    readHeaders: async () => {
      throw signal;
    },
    record: async () => undefined,
  });
  let rethrown: unknown;
  await runWithRequestContext(newRequestId(), async () => {
    try {
      await passing("board.view");
    } catch (error) {
      rethrown = error;
    }
  });
  add("s5: a Next control-flow error (with a digest) is rethrown, not swallowed", rethrown === signal);

  // A signal without a digest -- a React postpone -- is left to Next's own
  // `unstable_rethrow`, here the real one; an ordinary error that it does
  // not recognise is still swallowed and logged.
  const { unstable_rethrow } = await import("next/navigation.js");
  const postpone = { $$typeof: Symbol.for("react.postpone") };
  const viaRethrow = (thrown: unknown) =>
    createPageAudit({
      after: () => undefined,
      readHeaders: async () => {
        throw thrown;
      },
      record: async () => undefined,
      rethrowNextSignal: unstable_rethrow,
    });
  let postponed: unknown;
  await runWithRequestContext(newRequestId(), async () => {
    try {
      await viaRethrow(postpone)("board.view");
    } catch (error) {
      postponed = error;
    }
  });
  add("s5: a Next signal without a digest (a postpone) is rethrown via unstable_rethrow", postponed === postpone);
  const ordinary = await captureOutput(() =>
    runWithRequestContext(newRequestId(), async () => {
      const audit = await viaRethrow(new Error("synthetic headers failure"))("board.view");
      audit.success({ section: "upcoming" });
      return "rendered";
    }),
  );
  add(
    "s5: ...while an ordinary registration error still renders the page and is logged",
    ordinary.result === "rendered" &&
      ordinary.lines.some((line) => line.record?.event === "audit.write_failed" && line.record.reason === "writer_bug"),
    JSON.stringify(ordinary.result),
  );
  const helperSource = readFileSync(new URL("../lib/pageAudit.ts", import.meta.url), "utf8");
  add(
    "s5: the real helper hands unrecognised errors to Next's unstable_rethrow, loaded lazily",
    /await import\("next\/navigation"\)/.test(helperSource) &&
      /unstable_rethrow/.test(helperSource) &&
      !/^import[^;]*from "next\//m.test(helperSource),
  );
}

{
  // A failing or hanging write never reaches the page.
  const throwing = pageHarness(PAGE_HEADERS, async () => {
    throw new Error("synthetic writer failure");
  });
  let pageReturned = false;
  await runWithRequestContext(newRequestId(), async () => {
    const audit = await throwing.beginPageAudit("board.view");
    noteActor({ id: AUDIT_ACTOR.userId, name: AUDIT_ACTOR.name }, false);
    audit.success({ section: "upcoming" });
    pageReturned = true;
  });
  const { lines } = await captureOutput(() => throwing.flush());
  const failure = lines.find((line) => line.record?.event === "audit.write_failed")?.record;
  add("s5: a writer that throws: the page has already returned and the callback does not throw", pageReturned);
  add(
    "s5: ...and it is logged as audit.write_failed (writer_bug) with the request id and no actor",
    failure?.reason === "writer_bug" &&
      failure.requestId === PAGE_REQUEST_ID &&
      failure.op === "board.view" &&
      !lines.some((line) => line.text.includes(AUDIT_ACTOR.name) || line.text.includes(AUDIT_ACTOR.userId)),
    JSON.stringify(lines.map((line) => line.record)),
  );

  const hanging = pageHarness(PAGE_HEADERS, () => new Promise(() => undefined));
  const started = performance.now();
  let outcomeSet = false;
  await runWithRequestContext(newRequestId(), async () => {
    const audit = await hanging.beginPageAudit("board.view");
    audit.success({ section: "upcoming" });
    outcomeSet = true;
  });
  // Next would now run the callback after the response; it never settles, and
  // nothing above waited for it.
  void hanging.flush();
  add(
    "s5: a writer that hangs: the render completes without waiting for it",
    outcomeSet && hanging.callbacks.length === 1 && performance.now() - started < 200,
    String(performance.now() - started),
  );
}

{
  // The three pages, as written.
  const PAGE_FILES: Record<string, PageAuditOperation> = {
    "app/events/page.tsx": "board.view",
    "app/events/[id]/page.tsx": "event.view",
    "app/events/new/page.tsx": "event.create_form.view",
  };
  const callers = [
    ...(readdirSync(new URL("../app", import.meta.url), { recursive: true }) as string[]).map((file) => `app/${file}`),
    ...(readdirSync(new URL("../components", import.meta.url), { recursive: true }) as string[]).map((file) => `components/${file}`),
  ]
    .map((file) => file.replace(/\\/g, "/"))
    .filter((file) => /\.(ts|tsx)$/.test(file))
    .filter((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").includes("beginPageAudit"))
    .sort();
  add("s5: only the three approved pages call beginPageAudit", JSON.stringify(callers) === JSON.stringify(Object.keys(PAGE_FILES).sort()), JSON.stringify(callers));

  const problems: string[] = [];
  for (const [file, operation] of Object.entries(PAGE_FILES)) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    const body = source.slice(source.indexOf("export default async function"));
    const firstStatement = body
      .slice(body.search(/\)(: [^{]+)? \{\n/) + 1)
      .replace(/^[^{]*\{\n/, "")
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line !== "" && !line.startsWith("//"));
    if (firstStatement !== `const audit = await beginPageAudit("${operation}");`) problems.push(`${file}: first statement is ${firstStatement}`);
    if ((source.match(/beginPageAudit\(/g) ?? []).length !== 1) problems.push(`${file}: not exactly one beginPageAudit`);
    if (!/audit\.success\(/.test(source)) problems.push(`${file}: no audit.success`);
    for (const match of source.matchAll(/^\s*notFound\(\);/gm)) {
      const before = source.slice(0, match.index).trimEnd().split("\n").pop()?.trim();
      if (before !== "audit.notFound();" && before !== "audit.denied();") problems.push(`${file}: notFound() without an outcome (${before})`);
    }
    if (/after\(|headers\(\)|cookies\(\)/.test(source)) problems.push(`${file}: calls after/headers/cookies itself`);
  }
  add("s5: each page starts with its audit, and states an outcome before every notFound()", problems.length === 0, problems.join("; "));

  const detail = readFileSync(new URL("../app/events/[id]/page.tsx", import.meta.url), "utf8");
  add(
    "s5: the detail page's view follows its own render conditions (edit when editing, host when the manager lists render)",
    detail.includes('view: editing ? "edit" : viewerCanManage ? "host" : undefined') &&
      detail.includes("const editing = viewerCanManage && isEditing(query.edit);") &&
      /\{editing \? \(/.test(detail) &&
      /\{viewerCanManage && \(\s*<ApprovalQueue/.test(detail),
  );

  const helper = readFileSync(new URL("../lib/pageAudit.ts", import.meta.url), "utf8");
  add(
    "s5: the helper loads Next and the database only on first use",
    !/^import .*from "(next\/|\.\/db)/m.test(helper) && helper.includes('import("next/server")') && helper.includes('import("next/headers")'),
  );
}

/* ------------------------------------------------------------------ report */

const failed = checks.filter((check) => !check.ok);
for (const check of failed) {
  console.error(`FAIL  ${check.name}${check.detail ? `  (${check.detail})` : ""}`);
}
console.log(`check:logging -- ${checks.length - failed.length}/${checks.length} checks passed`);

process.exit(failed.length === 0 ? 0 : 1);
