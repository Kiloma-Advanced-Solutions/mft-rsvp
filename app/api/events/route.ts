/**
 * The events list, filtered to what the current viewer is allowed to see.
 *
 *   GET /api/events -> { events: EventRecord[] }
 *
 * `canSeeEvent` is the single source of truth for visibility -- this route
 * and the board page both call it, so an invite-only event can never appear
 * here for someone who was not invited, even if a screen forgot to filter.
 */

import { jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { canSeeEvent } from "@/lib/visibility";

export const GET = withErrorHandling(async () => {
  const [viewer, events] = await Promise.all([
    getCurrentUser(),
    db.events.list(),
  ]);

  const visible = events.filter((event) => canSeeEvent(viewer, event));

  return jsonOk({ events: visible });
});
