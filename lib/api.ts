/**
 * House style for Route Handlers.
 *
 * Every API route in this project returns one of two shapes:
 *
 *   success  ->  the payload, as-is
 *   failure  ->  { error: { message, code?, details? } }
 *
 * Keeping that consistent is what lets the client have a single `fetchJson`
 * helper instead of bespoke error handling at every call site. See
 * `app/api/session/route.ts` for a worked example of the whole pattern.
 *
 * Shared with Client Components, so it must stay free of server-only code.
 * The wrapper that catches a handler's errors and logs them,
 * `withErrorHandling`, is in `lib/apiHandler.ts` for that reason.
 *
 * `./labels.ts` carries its extension so that module can be loaded by the
 * bare-Node self-check through `lib/apiHandler.ts`.
 */

import { API_ERRORS, requestFailedLabel } from "./labels.ts";

/**
 * Throw this anywhere inside a handler wrapped in `withErrorHandling`.
 *
 * `reason` is for the audit log only: a machine-readable code saying *why*
 * (`full`, `stale`, `closed:draft`, ...) where `code` only says what kind of
 * refusal it was. It is never part of the response -- `withErrorHandling`
 * passes `code` and `details` to `jsonError` and nothing else -- so adding one
 * changes nothing a client sees. Without one, the audit row falls back to
 * `code`.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;
  readonly reason?: string;

  constructor(
    status: number,
    message: string,
    options?: { code?: string; details?: unknown; reason?: string },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options?.code;
    this.details = options?.details;
    this.reason = options?.reason;
  }

  static badRequest(message: string, details?: unknown, reason?: string) {
    return new ApiError(400, message, { code: "bad_request", details, reason });
  }

  static forbidden(message = API_ERRORS.forbidden, reason?: string) {
    return new ApiError(403, message, { code: "forbidden", reason });
  }

  static notFound(message = API_ERRORS.notFound, reason?: string) {
    return new ApiError(404, message, { code: "not_found", reason });
  }

  /** The request made sense but conflicts with the current state. */
  static conflict(message: string, reason?: string) {
    return new ApiError(409, message, { code: "conflict", reason });
  }
}

export function jsonOk<T>(data: T, status = 200): Response {
  return Response.json(data, { status });
}

export function jsonError(
  status: number,
  message: string,
  options?: { code?: string; details?: unknown },
): Response {
  return Response.json(
    { error: { message, code: options?.code, details: options?.details } },
    { status },
  );
}

/** Parses a JSON body, turning malformed input into a 400 rather than a 500. */
export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw ApiError.badRequest(API_ERRORS.invalidJson, undefined, "invalid_json");
  }
}

/**
 * What `fetchJson` throws for a non-2xx response: an ordinary `Error` carrying
 * the server's message, plus the HTTP status. Callers that only show the
 * message need nothing else; one that has to tell "the page was stale" (4xx)
 * from "a service behind the route failed" (5xx) reads `status`.
 *
 * `details` is the failure's `details` exactly as the server sent it -- for the
 * event form, its field errors. It is untrusted shape, so a caller that reads
 * it checks it first; `undefined` when the response carried none.
 */
export class RequestError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = "RequestError";
    this.status = status;
    this.details = details;
  }
}

/**
 * Client-side counterpart. Unwraps the success payload, or throws a
 * `RequestError` carrying the server's message so a component can show it
 * directly.
 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  const payload: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const error = (
      payload as { error?: { message?: string; details?: unknown } } | null
    )?.error;
    const message = error?.message ?? requestFailedLabel(response.status);
    throw new RequestError(response.status, message, error?.details);
  }

  return payload as T;
}
