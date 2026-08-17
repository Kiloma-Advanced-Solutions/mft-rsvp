/**
 * Assembles the events a viewer is allowed to see, with the per-event context
 * a screen needs alongside them. SERVER ONLY.
 *
 * Both `GET /api/events` and the board page call this, so visibility
 * filtering happens in exactly one place regardless of which one renders.
 */

import { db } from "./db";
import type { EventWithContext, User } from "./types";
import { visibleEventsFor } from "./visibility";

export async function listVisibleEventsWithContext(
  viewer: User,
): Promise<EventWithContext[]> {
  const [allEvents, allRegistrations, allUsers] = await Promise.all([
    db.events.list(),
    db.registrations.list(),
    db.users.list(),
  ]);

  const usersById = new Map(allUsers.map((user) => [user.id, user]));
  const visible = visibleEventsFor(allEvents, viewer);

  return visible.map((event) => {
    const registrations = allRegistrations.filter((row) => row.eventId === event.id);
    const hostIds = [event.organizerId, ...event.coHostIds];

    return {
      event,
      hosts: hostIds
        .map((id) => usersById.get(id))
        .filter((user): user is User => user !== undefined),
      goingCount: registrations.filter((row) => row.status === "going").length,
      pendingCount: registrations.filter((row) => row.status === "pending").length,
      viewerRegistration:
        registrations.find((row) => row.userId === viewer.id) ?? null,
      viewerCanManage: viewer.role === "admin" || hostIds.includes(viewer.id),
    };
  });
}
