/**
 * A host taking back somebody else's confirmed place.
 *
 *   POST /api/events/[id]/registrations/[registrationId]/remove -> { registration }
 *
 * `going -> removed`, and a route of its own with **no body**, the same shape as
 * `approve` and `reject` beside it: the session says who is acting, the URL says
 * which registration, and the route says which transition.
 *
 * Not a decision on a request. Rejecting turns down somebody who asked;
 * removing takes back a place somebody already had, so it has its own rule --
 * `getAttendeeRemovalAvailability()` -- rather than a third answer from the
 * request-decision one.
 *
 * It writes the registration row and nothing else. On an invite-only event the
 * invitation is a separate relationship and stays: the person can still see the
 * event, and sees that they were removed.
 *
 * It decides nothing itself: identity from `getCurrentUser()`, visibility from
 * `lib/events.ts`, manageability and the transition rule from
 * `lib/permissions.ts`.
 */

import { ApiError, jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getEventDetailForViewer } from "@/lib/events";
import {
  ATTENDEE_ACTION_COPY,
  MANAGE_ACTION_COPY,
  attendeeRemovalClosedNote,
} from "@/lib/labels";
import {
  canManageEvent,
  getAttendeeRemovalAvailability,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

type Context =
  RouteContext<"/api/events/[id]/registrations/[registrationId]/remove">;

/**
 * Remove: the confirmed place is taken back.
 *
 * Same order of refusals as `approve` and `reject` — 404 for missing and
 * invisible alike, then 403 for a viewer who may not manage, then 404 for a row
 * that is not this event's, then 409 for the transition — and all of them
 * before the write.
 *
 * A target who may manage the event themselves is a 409 rather than a 403: the
 * caller is allowed to remove people, just not this one. They withdraw instead.
 */
export const POST = withErrorHandling(
  async (_request: Request, context: Context) => {
    const [viewer, { id, registrationId }] = await Promise.all([
      getCurrentUser(),
      context.params,
    ]);

    const detail = await getEventDetailForViewer(id, viewer);
    if (!detail) throw ApiError.notFound();

    if (!canManageEvent(detail.event, viewer)) {
      throw ApiError.forbidden(MANAGE_ACTION_COPY.cannotManage);
    }

    // By id and checked against this event, exactly as the decision routes do,
    // so the three cannot drift on which ids they accept or what they disclose.
    const registration = await db.registrations.get(registrationId);

    if (!registration || registration.eventId !== detail.event.id) {
      throw ApiError.notFound();
    }

    // The rule needs to know who the place belongs to, because a manager's own
    // place is not removable this way. A registration always has its person --
    // the foreign key refuses an orphan -- so a miss is the same 404.
    const attendee = await db.users.get(registration.userId);
    if (!attendee) throw ApiError.notFound();

    const availability = getAttendeeRemovalAvailability(detail.event, {
      registration,
      attendee,
    });

    if (availability.state === "closed") {
      throw ApiError.conflict(attendeeRemovalClosedNote(availability.reason));
    }

    // No event lock: taking a place back only lowers the `going` count, so it
    // cannot put the event over capacity. What it must not do is act on a row
    // that moved after this check -- a second removal, or the person
    // withdrawing -- so the write is conditional on the row still being `going`,
    // and one that lost the race affects no rows and is told it changed.
    //
    // Only the status moves. `message`, `decidedBy` and `decidedAt` belong to
    // the request that got them in, and stay as the record of it.
    const removed = await db.registrations.update(
      registration.id,
      { status: "removed" },
      "going",
    );

    if (!removed) throw ApiError.conflict(ATTENDEE_ACTION_COPY.stale);

    return jsonOk({ registration: removed });
  },
);
