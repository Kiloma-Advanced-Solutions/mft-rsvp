/**
 * GET /api/events -> { events: EventWithContext[] }
 *
 * Only ever returns events `currentUser` is allowed to see -- the filter in
 * `lib/permissions.ts` runs here, not in the browser. Category and access-mode
 * filtering on the board is a client-side affordance on top of an already-safe
 * list, so it is not a query parameter on this route.
 */

import { jsonOk, withErrorHandling } from "@/lib/api";
import { getVisibleEventsWithContext } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";

export const GET = withErrorHandling(async () => {
  const currentUser = await getCurrentUser();
  const events = await getVisibleEventsWithContext(currentUser);

  return jsonOk({ events });
});
