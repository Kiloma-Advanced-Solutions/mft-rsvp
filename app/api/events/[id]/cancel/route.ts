/**
 * Cancelling a published event.
 *
 *   POST /api/events/[id]/cancel  -> { event }
 *
 * A lifecycle transition, so it has its own route the way publishing does,
 * rather than a `status` field on `PATCH`. It reads **no body**: the session
 * says who is acting, the URL says which event, and the route says which
 * transition.
 *
 * `published -> cancelled` is the only transition here, and it is terminal --
 * nothing moves an event back out of `cancelled`. It writes the event row and
 * nothing else: every registration stays exactly as it was, and the event's
 * status is what closes registering, withdrawing and deciding requests from
 * now on (`lib/permissions.ts`).
 *
 * It decides nothing itself: identity from `getCurrentUser()`, visibility from
 * `lib/events.ts`, manageability and whether the event may be cancelled from
 * `lib/permissions.ts` -- the same answers the detail page renders from.
 */

import { ApiError, jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getEventDetailForViewer } from "@/lib/events";
import { MANAGE_ACTION_COPY, cancellationClosedNote } from "@/lib/labels";
import { canManageEvent, getCancellationAvailability } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

type Context = RouteContext<"/api/events/[id]/cancel">;

/**
 * Cancel.
 *
 * The refusals are in the order that matters, the same as publishing: a
 * missing event and one the caller may not see both answer 404, manageability
 * is a 403 only for someone who can already see the event, and a state that
 * cannot be cancelled is a 409 -- whoever asked is allowed to cancel, there is
 * just nothing here that can be.
 */
export const POST = withErrorHandling(
  async (_request: Request, context: Context) => {
    const [viewer, { id }] = await Promise.all([
      getCurrentUser(),
      context.params,
    ]);

    const detail = await getEventDetailForViewer(id, viewer);
    if (!detail) throw ApiError.notFound();

    if (!canManageEvent(detail.event, viewer)) {
      throw ApiError.forbidden(MANAGE_ACTION_COPY.cannotManage);
    }

    const availability = getCancellationAvailability(detail.event);
    if (availability.state === "closed") {
      throw ApiError.conflict(cancellationClosedNote(availability.reason));
    }

    // Conditional on the row still being published, so two requests that both
    // read it that way cannot both cancel it: the second writes nothing and is
    // told the event changed, as is one whose event was deleted in between.
    // No seat lock: cancelling gives nobody a place, and a seat claim that
    // locks this row after the write re-reads `cancelled` and refuses.
    const event = await db.events.update(
      detail.event.id,
      { status: "cancelled" },
      "published",
    );
    if (!event) throw ApiError.conflict(MANAGE_ACTION_COPY.stale);

    return jsonOk({ event });
  },
);
