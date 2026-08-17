/**
 * Events board.
 *
 *   GET /api/events   -> { events: EventWithContext[] }
 *
 * Visibility filtering happens in `listVisibleEventsWithContext`, not here —
 * this handler only wires it to the current viewer. See `lib/visibility.ts`
 * for the rule itself.
 */

import { jsonOk, withErrorHandling } from "@/lib/api";
import { listVisibleEventsWithContext } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";

export const GET = withErrorHandling(async () => {
  const viewer = await getCurrentUser();
  const events = await listVisibleEventsWithContext(viewer);

  return jsonOk({ events });
});
