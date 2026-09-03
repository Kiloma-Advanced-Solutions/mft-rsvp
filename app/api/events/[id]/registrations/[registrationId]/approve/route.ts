/**
 * A host approving somebody else's request.
 *
 *   POST /api/events/[id]/registrations/[registrationId]/approve -> { registration }
 *
 * A route of its own with **no body**, the same shape as
 * `POST /api/events/[id]/publish`: the session says who is acting, the URL says
 * which request, and the route says which transition. Nothing the caller sends
 * can choose the actor, the target or the resulting status.
 *
 * The collection route beside this one is the caller's *own* place at an event.
 * These two item routes are the other half — a host deciding a row that belongs
 * to somebody else — which is why they are authorised on `canManageEvent()`
 * rather than on registration availability.
 *
 * It decides nothing itself: identity from `getCurrentUser()`, visibility from
 * `lib/events.ts`, manageability and the transition rules from
 * `lib/permissions.ts`.
 */

import { ApiError, jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getEventDetailForViewer } from "@/lib/events";
import {
  MANAGE_ACTION_COPY,
  REQUEST_ACTION_COPY,
  requestDecisionNote,
} from "@/lib/labels";
import {
  canManageEvent,
  getRequestDecisionAvailability,
  requestCanBeApproved,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

type Context =
  RouteContext<"/api/events/[id]/registrations/[registrationId]/approve">;

/**
 * Approve: the request becomes a confirmed place.
 *
 * The refusals run in the order that matters, and all of them before the write:
 *
 *   - a missing event and one the caller may not see answer identically with a
 *     404, so this endpoint cannot be used to discover a draft or an
 *     invite-only event;
 *   - manageability is a 403 only afterwards, when the caller can already see
 *     the event anyway;
 *   - a `registrationId` that is not one of *this* event's rows is another 404,
 *     so a host of one event learns nothing about another's;
 *   - and only then the transition itself, as a 409.
 *
 * Capacity is enforced here through the shared rule rather than compared by
 * hand, so the disabled button on the page and this refusal come from the same
 * answer. `TASKS.md` section 4: a host cannot approve past capacity.
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

    // Read back from the store rather than from `detail.requests`, which holds
    // only the decidable rows: a row that is already `going` should refuse as a
    // conflict, not disappear into a 404.
    const rows = await db.registrations.list({ eventId: detail.event.id });
    const registration = rows.find((row) => row.id === registrationId);
    if (!registration) throw ApiError.notFound();

    const availability = getRequestDecisionAvailability(detail.event, {
      goingCount: detail.goingCount,
      registration,
    });

    if (!requestCanBeApproved(availability)) {
      // Every state that refuses approving carries a reason; the fallback is
      // what proves that to the compiler rather than a case that can happen.
      throw ApiError.conflict(
        requestDecisionNote(availability) ?? REQUEST_ACTION_COPY.stale,
      );
    }

    const decided = await db.registrations.update(registration.id, {
      status: "going",
      decidedBy: viewer.id,
      decidedAt: new Date().toISOString(),
      // `message` is deliberately untouched: it is what the person wrote for
      // this cycle, and it stays the record of why the host said yes.
    });

    if (!decided) throw ApiError.conflict(REQUEST_ACTION_COPY.stale);

    return jsonOk({ registration: decided });
  },
);
