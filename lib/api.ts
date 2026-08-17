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
 */

/** Throw this anywhere inside a handler wrapped in `withErrorHandling`. */
export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(
    status: number,
    message: string,
    options?: { code?: string; details?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = options?.code;
    this.details = options?.details;
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, message, { code: "bad_request", details });
  }

  static forbidden(message = "You are not allowed to do that.") {
    return new ApiError(403, message, { code: "forbidden" });
  }

  static notFound(message = "Not found.") {
    return new ApiError(404, message, { code: "not_found" });
  }

  /** The request made sense but conflicts with the current state. */
  static conflict(message: string) {
    return new ApiError(409, message, { code: "conflict" });
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

/**
 * Wraps a handler so thrown `ApiError`s become clean responses and anything
 * unexpected becomes a 500 without leaking a stack trace to the client.
 *
 *   export const GET = withErrorHandling(async () => { ... })
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonError(error.status, error.message, {
          code: error.code,
          details: error.details,
        });
      }
      console.error("[api] unhandled error", error);
      return jsonError(500, "Something went wrong.", { code: "internal" });
    }
  };
}

/** Parses a JSON body, turning malformed input into a 400 rather than a 500. */
export async function readJson<T = unknown>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw ApiError.badRequest("Request body must be valid JSON.");
  }
}

/**
 * Client-side counterpart. Unwraps the success payload, or throws an `Error`
 * carrying the server's message so a component can show it directly.
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
    const message =
      (payload as { error?: { message?: string } } | null)?.error?.message ??
      `Request failed with status ${response.status}.`;
    throw new Error(message);
  }

  return payload as T;
}
