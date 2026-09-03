/**
 * A host rejecting somebody else's request.
 *
 *   POST /api/events/[id]/registrations/[registrationId]/reject -> { registration }
 *
 * The mirror of `approve` beside it, and deliberately a separate bodyless route
 * rather than one endpoint taking a decision: the route is what names the
 * transition, so nothing a caller sends can pick it.
 *
 * The one asymmetry is capacity. Approving is refused on a full event; turning
 * somebody down never is, because refusing a request is exactly what a host of
 * a full event needs to be able to do.
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
  requestCanBeRejected,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

type Context =
  RouteContext<"/api/events/[id]/registrations/[registrationId]/reject">;

/**
 * Reject: the request is turned down.
 *
 * Same order of refusals as `approve` — 404 for missing and invisible alike,
 * then 403 for a viewer who may not manage, then 404 for a row that is not this
 * event's, then 409 for the transition — and all of them before the write.
 *
 * Rejecting is not the end of the story. `TASKS.md` section 4 keeps a rejected
 * request approvable from the queue, so this is reversible by the host and
 * needs no confirmation in front of it. What it is not is repeatable: a row
 * that is already `rejected` refuses rather than re-stamping the decision.
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

    // From the store, not from `detail.requests`: a row that is already `going`
    // is a conflict to report, not a row to pretend does not exist.
    const rows = await db.registrations.list({ eventId: detail.event.id });
    const registration = rows.find((row) => row.id === registrationId);
    if (!registration) throw ApiError.notFound();

    const availability = getRequestDecisionAvailability(detail.event, {
      goingCount: detail.goingCount,
      registration,
    });

    if (!requestCanBeRejected(availability)) {
      // `approve_only` is the one refusal with no closed reason behind it —
      // the request is fine, it has simply been rejected already.
      throw ApiError.conflict(
        requestDecisionNote(availability) ?? REQUEST_ACTION_COPY.alreadyRejected,
      );
    }

    const decided = await db.registrations.update(registration.id, {
      status: "rejected",
      decidedBy: viewer.id,
      decidedAt: new Date().toISOString(),
      // `message` stays: it is what the request said, and a host looking at the
      // rejected group later should still see what they turned down.
    });

    if (!decided) throw ApiError.conflict(REQUEST_ACTION_COPY.stale);

    return jsonOk({ registration: decided });
  },
);
