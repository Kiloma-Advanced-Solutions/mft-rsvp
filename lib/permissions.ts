/**
 * Who may see an event, who may manage it, and who may take a place at it.
 *
 * The questions are deliberately separate: visibility is about discovery,
 * manageability is about being a host or an admin, and availability is about
 * one person's own place. Keeping them apart is what stops "can see" from
 * quietly becoming "can change".
 *
 * The rules themselves are specified in `TASKS.md` section 4 — those tables are
 * authoritative and are not restated here. This file is their single
 * implementation, so pages and route handlers answer all three questions with
 * the same code rather than re-deriving them.
 *
 * Synchronous, and with no store and no session: the caller resolves the viewer
 * through `getCurrentUser()` and passes it in along with any counts, which keeps
 * the trusted-identity boundary in one place. The only impurity is the clock,
 * read through `isPast` to decide whether an event has already started.
 */

import { isPast } from "./date";
import type {
  EventRecord,
  Registration,
  RegistrationAvailability,
  User,
} from "./types";

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

/**
 * Is this event full? Only `going` counts against capacity, and a `null`
 * capacity is unlimited. Private for now — nothing outside this file needs to
 * ask yet, and `TASKS.md` section 7 does not want unused exports.
 */
function isEventFull(
  event: Pick<EventRecord, "capacity">,
  goingCount: number,
): boolean {
  return event.capacity !== null && goingCount >= event.capacity;
}

/**
 * What, if anything, may this person do about their own place at this event?
 *
 * The one implementation of the "Registering" and "Withdrawing" rules in
 * `TASKS.md` section 4, so the detail screen and the registration routes cannot
 * reach different answers. It reads the clock through `isPast` — still no store
 * and no session, so the caller keeps supplying both the viewer and the counts.
 *
 * Order matters and is the specification's own: an event-level closure beats
 * anyone's personal state, and being already in beats a capacity check.
 */
export function getRegistrationAvailability(
  event: EventRecord,
  user: User,
  {
    goingCount,
    viewerRegistration,
  }: { goingCount: number; viewerRegistration: Registration | null },
): RegistrationAvailability {
  // A draft, a cancellation or a start time that has passed closes registration
  // for everybody, hosts included.
  if (event.status === "draft") return { state: "closed", reason: "draft" };
  if (event.status === "cancelled") {
    return { state: "closed", reason: "cancelled" };
  }
  if (isPast(event.startsAt)) return { state: "closed", reason: "started" };

  // Whoever is `going` or `pending` may withdraw. Nothing else may.
  const status = viewerRegistration?.status;
  if (status === "going" || status === "pending") {
    return { state: "registered", action: "withdraw", status };
  }

  // A rejected request cannot be sent again; only a host can revive it. A
  // withdrawn (`cancelled`) one can, so it falls through.
  if (status === "rejected") return { state: "closed", reason: "rejected" };

  // Invite-only admits the invite list plus whoever may manage the event — a
  // host is not on their own invite list, and should still be able to attend.
  if (
    event.access === "invite" &&
    !event.invitedUserIds.includes(user.id) &&
    !canManageEvent(event, user)
  ) {
    return { state: "closed", reason: "not_invited" };
  }

  // A full `approval` event still takes requests; a host just cannot approve
  // past capacity. `open` and `invite` close.
  if (event.access !== "approval" && isEventFull(event, goingCount)) {
    return { state: "closed", reason: "full" };
  }

  return event.access === "approval"
    ? { state: "open", action: "request" }
    : { state: "open", action: "register" };
}
