/**
 * Who may see an event, and who may manage it.
 *
 * The two questions are deliberately separate: visibility is about discovery,
 * manageability is about being a host or an admin. Keeping them apart is what
 * stops "can see" from quietly becoming "can change".
 *
 * The rules themselves are specified in `TASKS.md` section 4 — that table is
 * authoritative and is not restated here. This file is its single
 * implementation, so pages and route handlers answer both questions with the
 * same code rather than re-deriving them.
 *
 * Pure and synchronous on purpose: no store, no session, no I/O. The caller
 * resolves the viewer through `getCurrentUser()` and passes it in, which keeps
 * the trusted-identity boundary in one place.
 */

import type { EventRecord, User } from "./types";

/**
 * A host is the event's organizer or anyone in `coHostIds`. Not a role — it is
 * answered per event, which is why it takes both arguments.
 */
function isHost(event: EventRecord, user: User): boolean {
  return event.organizerId === user.id || event.coHostIds.includes(user.id);
}

/**
 * May this person see this event at all?
 *
 * A `false` here has to mean the event is absent from the response, not hidden
 * in the browser — the board must never leak an invite-only event to someone
 * who was not invited.
 */
export function canViewEvent(event: EventRecord, user: User): boolean {
  // Hosts and admins see everything about their own events, including drafts.
  if (user.role === "admin" || isHost(event, user)) return true;

  // Drafts are host-only, whatever their access mode.
  if (event.status === "draft") return false;

  // `published` and `cancelled` both follow the access mode from here: a
  // cancelled event stays visible to whoever could see it before.
  if (event.access === "invite") return event.invitedUserIds.includes(user.id);

  return true;
}

/** May this person edit, delete, publish, or decide requests on this event? */
export function canManageEvent(event: EventRecord, user: User): boolean {
  return user.role === "admin" || isHost(event, user);
}
