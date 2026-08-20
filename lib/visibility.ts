/**
 * Who is allowed to see an event. SERVER ONLY.
 *
 * This is the single answer to that question. The board, the detail page and
 * the API routes all call in here rather than each re-reading the table in
 * section 4 of `TASKS.md` — one place to read, one place to fix, and no way for
 * a page and a route handler to disagree about whether an event exists.
 *
 * The rules, in the order they are decided:
 *
 *   1. Hosts and admins see everything about their own events, always.
 *   2. A `draft` is invisible to everybody else, whatever its access mode.
 *   3. An `invite` event is visible only to the people on its invite list.
 *   4. Everything else — `published` or `cancelled`, `open` or `approval` — is
 *      visible to everyone.
 *
 * A cancelled event is treated exactly as a published one, so cancelling never
 * widens an event's audience.
 */

import { db } from "./db";
import type { EventRecord, User } from "./types";

/** The event's organizer, or one of its co-hosts. */
function isHost(event: EventRecord, user: User): boolean {
  return event.organizerId === user.id || event.coHostIds.includes(user.id);
}

export function canViewEvent(event: EventRecord, user: User): boolean {
  if (isHost(event, user) || user.role === "admin") return true;

  if (event.status === "draft") return false;

  if (event.access === "invite") {
    return event.invitedUserIds.includes(user.id);
  }

  return true;
}

/**
 * Every event this person may see. Filtering happens here, on the server, so
 * an event nobody should know about never reaches the browser at all.
 */
export async function listVisibleEvents(user: User): Promise<EventRecord[]> {
  const events = await db.events.list();
  return events.filter((event) => canViewEvent(event, user));
}
