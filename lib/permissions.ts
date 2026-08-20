/**
 * Authorisation rules for events. SERVER ONLY in spirit -- nothing here reads
 * a database, but every answer it gives is meant to be trusted only when it
 * runs on the server. See section 4 of `TASKS.md` for the table this encodes.
 *
 * This is the one place that answers "can this person see this event" and
 * "can this person manage this event" -- route handlers and Server Components
 * both call in here rather than re-deriving the rule locally.
 */

import type { EventRecord, User } from "./types";

/** A host is the event's organizer, or anyone listed as a co-host. */
export function isEventHost(user: User, event: EventRecord): boolean {
  return event.organizerId === user.id || event.coHostIds.includes(user.id);
}

/** Hosts and admins may edit, publish, delete and decide requests. */
export function canUserManageEvent(user: User, event: EventRecord): boolean {
  return user.role === "admin" || isEventHost(user, event);
}

/**
 * Whether `user` may see `event` at all -- appearing on the board, in the API
 * response, or on the detail page. An event this returns `false` for must
 * 404, not 403 (see TASKS.md): a 403 would confirm the event exists.
 */
export function canUserSeeEvent(user: User, event: EventRecord): boolean {
  if (canUserManageEvent(user, event)) return true;

  // Drafts are host/admin only, whatever their access mode.
  if (event.status === "draft") return false;

  // Published and cancelled events share the same visibility, keyed by
  // `access`. Cancelled stays visible to whoever could already see it.
  if (event.access === "invite") return event.invitedUserIds.includes(user.id);
  return true;
}
