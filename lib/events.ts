/**
 * Assembles the event data a screen needs, on top of the visibility rule in
 * `lib/permissions.ts`. Called from both the board page and the events API
 * route, so "which events can this person see" is answered in exactly one
 * place and "what does this person see about each one" in exactly one other.
 *
 * SERVER ONLY -- reads `lib/db.ts` directly. Client code goes through
 * `/api/events` instead.
 */

import { db } from "./db";
import { canUserManageEvent, canUserSeeEvent } from "./permissions";
import type { EventWithContext, User } from "./types";

/**
 * Every event `currentUser` is allowed to see, each with the derived facts
 * `EventCard` and the detail page need alongside it: who hosts it, how many
 * are going or pending, and the viewer's own registration.
 */
export async function getVisibleEventsWithContext(
  currentUser: User,
): Promise<EventWithContext[]> {
  const [events, users, registrations] = await Promise.all([
    db.events.list(),
    db.users.list(),
    db.registrations.list(),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));

  const registrationsByEventId = new Map<string, typeof registrations>();
  for (const registration of registrations) {
    const existing = registrationsByEventId.get(registration.eventId);
    if (existing) {
      existing.push(registration);
    } else {
      registrationsByEventId.set(registration.eventId, [registration]);
    }
  }

  return events
    .filter((event) => canUserSeeEvent(currentUser, event))
    .map((event): EventWithContext => {
      const eventRegistrations = registrationsByEventId.get(event.id) ?? [];
      const hosts = [event.organizerId, ...event.coHostIds]
        .map((id) => usersById.get(id))
        .filter((user): user is User => Boolean(user));

      return {
        event,
        hosts,
        goingCount: eventRegistrations.filter((r) => r.status === "going").length,
        pendingCount: eventRegistrations.filter((r) => r.status === "pending")
          .length,
        viewerRegistration:
          eventRegistrations.find((r) => r.userId === currentUser.id) ?? null,
        viewerCanManage: canUserManageEvent(currentUser, event),
      };
    });
}
