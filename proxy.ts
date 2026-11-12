/**
 * Gives every request the server handles a request id of the server's choosing.
 *
 * Next 16's Proxy (formerly Middleware) runs before routing, on the Node.js
 * runtime. This one does one thing: it generates a UUID, puts it on the
 * request under `x-request-id` -- **replacing** any value the client sent, so a
 * caller cannot choose or reuse an id -- and puts the same value on the
 * response as `X-Request-Id`, so a person reporting a problem can quote it.
 * Route handlers, pages and `instrumentation.ts` read it from the request
 * headers (`lib/requestId.ts`); the application log and the audit log carry it.
 *
 * It decides nothing about who may see what. Authorisation stays in the route
 * handlers and pages; a proxy is not an authorisation boundary.
 *
 * WHICH REQUESTS. Everything except the build's static files
 * (`_next/static`, `_next/image`) and the favicon, which run no application
 * code and have nothing to correlate. API routes are included. Router
 * prefetches are included too, deliberately: a request the proxy skips would
 * reach the page with whatever `x-request-id` the client chose, and keeping
 * prefetches out of the *audit* log is the page-audit helper's job, not a
 * reason to let a client pick the id.
 */

import { NextResponse, type NextRequest } from "next/server";

import { newRequestId, REQUEST_ID_HEADER } from "./lib/requestId";

export function proxy(request: NextRequest): NextResponse {
  const requestId = newRequestId();

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico).*)"],
};
