/**
 * Event visibility. SERVER ONLY.
 *
 * The single place that answers "can this person see this event" (section 5.2
 * of TASKS.md). Both the board page and `GET /api/events` call this so the
 * rule can never drift between what is rendered and what is actually sent
 * over the wire.
 */

import type { EventRecord, User } from "./types";

function isHost(event: Pick<EventRecord, "organizerId" | "coHostIds">, user: User): boolean {
  return event.organizerId === user.id || event.coHostIds.includes(user.id);
}

export function canViewEvent(event: EventRecord, viewer: User): boolean {
  if (viewer.role === "admin") return true;
  if (isHost(event, viewer)) return true;

  if (event.status === "draft") return false;

  if (event.access === "invite") {
    return event.invitedUserIds.includes(viewer.id);
  }

  return true;
}

export function visibleEventsFor(events: EventRecord[], viewer: User): EventRecord[] {
  return events.filter((event) => canViewEvent(event, viewer));
}
