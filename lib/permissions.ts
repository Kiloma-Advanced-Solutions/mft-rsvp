/**
 * Who may see an event, and who may manage it.
 *
 * The two questions the whole product turns on, answered in one place. Pages
 * call these to decide what to render; route handlers call the same functions
 * to decide what to return. Hiding a card is a UX affordance — this is the rule.
 *
 * Pure functions over records that have already been loaded, so they hold no
 * opinion about where the data came from and keep working when `lib/db.ts` is
 * swapped for a real database.
 */

import type { EventRecord, User } from "./types";

/** The organizer, plus anyone they added as a co-host. */
export function isHost(event: EventRecord, user: User): boolean {
  return event.organizerId === user.id || event.coHostIds.includes(user.id);
}

/** Only meaningful on an `invite` event. */
export function isInvited(event: EventRecord, user: User): boolean {
  return event.invitedUserIds.includes(user.id);
}

/**
 * Section 4 of `TASKS.md`, in the order the rules resolve:
 *
 *   hosts and admins  -- see everything, drafts included
 *   drafts            -- nobody else
 *   invite            -- invited people only
 *   anything else     -- everyone
 *
 * A `cancelled` event stays visible to whoever could see it while it was
 * published, which falls out of that ordering rather than needing its own case.
 */
export function canViewEvent(event: EventRecord, user: User): boolean {
  if (user.role === "admin" || isHost(event, user)) return true;
  if (event.status === "draft") return false;
  if (event.access === "invite") return isInvited(event, user);
  return true;
}

/** Edit, delete, publish, and decide on requests. */
export function canManageEvent(event: EventRecord, user: User): boolean {
  return user.role === "admin" || isHost(event, user);
}
