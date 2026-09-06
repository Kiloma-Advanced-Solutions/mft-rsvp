/**
 * Who may see an event, who may manage it, who may take a place at it, and what
 * a host may decide about somebody else's request.
 *
 * The questions are deliberately separate: visibility is about discovery,
 * manageability is about being a host or an admin, availability is about one
 * person's own place, and request decisions are about a row somebody else owns.
 * Keeping them apart is what stops "can see" from quietly becoming "can
 * change".
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
  RequestDecisionAvailability,
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
 * May this person create an event at all?
 *
 * The only one of these questions that is not about a particular event, so it
 * takes just the user. Whoever creates one becomes its organizer and therefore
 * its host, which is what `canManageEvent()` answers from then on.
 */
export function canCreateEvent(user: User): boolean {
  return user.role === "admin" || user.role === "organizer";
}

/**
 * Is this event full? Only `going` counts against capacity, and a `null`
 * capacity is unlimited. Private: both callers — one person's own availability
 * and a host's decision on somebody else's request — are in this file, and
 * `TASKS.md` section 7 does not want unused exports.
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

/**
 * What may a host decide about one request right now?
 *
 * The fourth question, and again a separate one. It deliberately takes no user:
 * *whether* the actor may decide at all is `canManageEvent()`, and every host
 * gets the same answer here, so folding the two together would give the rule
 * two reasons to say no and make the refusal ambiguous.
 *
 * It answers about a registration row, not about the event's current access
 * mode. A request outlives an access change — a host who switches an
 * `approval` event to `open` still has to resolve the requests already sitting
 * there — so the row's own status is what decides, not how people get in today.
 *
 * Order matters and mirrors `getRegistrationAvailability()`: an event-level
 * closure beats the row's state, and the row's state is read before capacity.
 *
 * Two rules from `TASKS.md` section 4 meet here. A host "cannot approve past
 * capacity", which closes approving on a full event while leaving rejection
 * alone; and someone rejected "may not re-request — the host can still approve
 * them from the queue", which keeps a `rejected` row approvable.
 */
export function getRequestDecisionAvailability(
  event: EventRecord,
  {
    goingCount,
    registration,
  }: { goingCount: number; registration: Registration },
): RequestDecisionAvailability {
  // The same closure that stops people registering stops a host deciding: a
  // place at an event that is over or cancelled is worth nothing to give away.
  if (event.status === "draft") return { state: "closed", reason: "draft" };
  if (event.status === "cancelled") {
    return { state: "closed", reason: "cancelled" };
  }
  if (isPast(event.startsAt)) return { state: "closed", reason: "started" };

  // `going`, `cancelled` and `waitlisted` are not a host's to decide. A
  // withdrawn row in particular is the person's own answer, not a request.
  const { status } = registration;
  if (status !== "pending" && status !== "rejected") {
    return { state: "closed", reason: "not_decidable" };
  }

  const full = isEventFull(event, goingCount);

  // Already turned down: approving is the only way left, and only if there is
  // a seat. Rejecting it a second time would change nothing.
  if (status === "rejected") {
    return full ? { state: "closed", reason: "full" } : { state: "approve_only" };
  }

  return full ? { state: "reject_only", reason: "full" } : { state: "open" };
}

/**
 * Whether each decision is on offer, read off the availability above.
 *
 * The queue and the two route handlers all ask through these rather than
 * matching on the state themselves, so the mapping from "what state is this
 * request in" to "which button may act" has one home and the screen cannot
 * offer something the API will refuse.
 */
export function requestCanBeApproved(
  availability: RequestDecisionAvailability,
): boolean {
  return availability.state === "open" || availability.state === "approve_only";
}

export function requestCanBeRejected(
  availability: RequestDecisionAvailability,
): boolean {
  return availability.state === "open" || availability.state === "reject_only";
}
