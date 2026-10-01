/**
 * A host giving a removed attendee their place back.
 *
 *   POST /api/events/[id]/registrations/[registrationId]/restore -> { registration }
 *
 * `removed -> going`, the inverse of `remove` beside it, and the same bodyless
 * shape: the session says who is acting, the URL says which registration, and
 * the route says which transition.
 *
 * Only on an `approval` or `invite` event. On an `open` one the current access
 * mode wins: the person may register again themselves, so there is nothing for
 * a host to restore. Nothing here touches the invite list either -- removal
 * never revoked the invitation, so there is none to give back.
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
  attendeeRestoreClosedNote,
} from "@/lib/labels";
import {
  canManageEvent,
  getAttendeeRestoreAvailability,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

type Context =
  RouteContext<"/api/events/[id]/registrations/[registrationId]/restore">;

/**
 * Restore: the removed attendee is confirmed again.
 *
 * Same order of refusals as `remove` — 404 for missing and invisible alike,
 * then 403 for a viewer who may not manage, then 404 for a row that is not this
 * event's, then 409 for the transition — and all of them before the write.
 *
 * Capacity is enforced through the shared rule, twice, exactly as approving is:
 * here for the words the host sees, and again under the event-row lock for the
 * answer that is true.
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

    // By id and checked against this event, the same mechanism as `remove`,
    // `approve` and `reject`.
    const registration = await db.registrations.get(registrationId);

    if (!registration || registration.eventId !== detail.event.id) {
      throw ApiError.notFound();
    }

    // The refusal the host sees, from the snapshot this request loaded. The
    // right basis for the message, the wrong one for the write:
    // `detail.goingCount` was true when it was read, and restoring is exactly
    // the action that can make it untrue.
    const availability = getAttendeeRestoreAvailability(detail.event, {
      goingCount: detail.goingCount,
      registration,
    });

    if (availability.state === "closed") {
      throw ApiError.conflict(attendeeRestoreClosedNote(availability.reason));
    }

    // Restoring is a seat claim: it locks the event row, re-counts under the
    // lock, re-runs the rule above, and writes only if the row is still
    // `removed`. Two restores, or a restore and anybody else taking the last
    // seat, cannot both succeed.
    const restore = await db.registrations.restore(
      detail.event.id,
      registration.id,
    );

    switch (restore.outcome) {
      case "restored":
        return jsonOk({ registration: restore.registration });
      case "refused":
        // Every refused outcome carries a closed availability; the fallback is
        // what proves that to the compiler rather than a case that can happen.
        throw ApiError.conflict(
          restore.availability.state === "closed"
            ? attendeeRestoreClosedNote(restore.availability.reason)
            : ATTENDEE_ACTION_COPY.stale,
        );
      case "stale":
        throw ApiError.conflict(ATTENDEE_ACTION_COPY.stale);
      case "not_found":
      case "gone":
        // The row or its event went away while this request was in flight --
        // the same 404 either would have produced above.
        throw ApiError.notFound();
    }
  },
);
