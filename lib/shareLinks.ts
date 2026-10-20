/**
 * The absolute URL an event is shared by. SERVER ONLY.
 *
 * Sharing grants nothing, so the shared URL is the event's own canonical page,
 * `/events/[id]` -- no token, no record, nothing to revoke. Whoever opens it is
 * answered by `canViewEvent()` exactly as if they had typed it, and an
 * invite-only event stays a 404 for anyone not on its list.
 *
 * This is the one place that URL is built. Copying a link from the detail page
 * and emailing one both come through here, so they cannot disagree, and moving
 * the deployment means changing `EVENTS_APP_BASE_URL` and nothing else.
 *
 * The origin is configuration, never the incoming request. A `Host` header is
 * whatever the caller sent, and a URL built from it and mailed to somebody
 * would carry an attacker's hostname under the product's name.
 */

import "server-only";

const APP_BASE_URL_VAR = "EVENTS_APP_BASE_URL";

/**
 * The configured origin, or `null` when it is missing or unusable.
 *
 * Only an `http`/`https` origin is accepted: no path, query, fragment or
 * credentials. The app is served from the root (`next.config.ts` sets no
 * `basePath`), so a path here could only produce links to pages that do not
 * exist. A trailing slash is fine -- `new URL` reads it as the root path.
 *
 * `null` rather than a throw, unlike the database connection string: the
 * database is needed to serve any page at all, while sharing is one optional
 * host tool, and a missing value should cost the host that tool rather than
 * the whole detail page.
 */
function readAppBaseUrl(): string | null {
  const raw = process.env[APP_BASE_URL_VAR]?.trim();
  if (!raw) return null;

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  const isHttp = url.protocol === "http:" || url.protocol === "https:";
  const isBareOrigin =
    url.pathname === "/" &&
    url.search === "" &&
    url.hash === "" &&
    url.username === "" &&
    url.password === "";

  return isHttp && isBareOrigin ? url.origin : null;
}

/**
 * `<EVENTS_APP_BASE_URL>/events/<id>`, or `null` when the base URL is not
 * configured. Callers decide what an unavailable link means for them; none of
 * them may fall back to another origin.
 */
export function buildEventShareUrl(eventId: string): string | null {
  const origin = readAppBaseUrl();
  if (!origin) return null;
  return `${origin}/events/${encodeURIComponent(eventId)}`;
}
