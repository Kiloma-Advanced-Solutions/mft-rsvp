/**
 * Publishing a draft.
 *
 *   POST /api/events/[id]/publish  -> { event }
 *
 * A route of its own rather than a `status` field on `PATCH`, which is what
 * keeps the content editor free of lifecycle logic. Two consequences worth
 * naming: `status` is not in the patchable field set at all, so no request body
 * can move an event's lifecycle sideways; and this handler reads **no body**, so
 * it is safe to call with none, exactly like the registration handlers.
 *
 * The one transition M4 allows is `draft -> published`. Cancelling and
 * un-publishing are not in this milestone, so there is no transition table
 * here -- only a precondition.
 *
 * It decides nothing itself: identity from `getCurrentUser()`, visibility from
 * `lib/events.ts`, manageability from `lib/permissions.ts`.
 */

import { ApiError, jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getEventDetailForViewer } from "@/lib/events";
import { MANAGE_ACTION_COPY } from "@/lib/labels";
import { canManageEvent } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

type Context = RouteContext<"/api/events/[id]/publish">;

/**
 * Publish.
 *
 * The refusals are in the order that matters: a missing event and one the
 * caller may not see answer identically with a 404, so this endpoint cannot be
 * used to discover that somebody else has a draft. Manageability is a 403 only
 * afterwards, when the caller can already see the event anyway.
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

    // A conflict with the event's current state rather than a missing
    // permission: whoever asked is allowed to publish, there is just nothing
    // here to publish.
    if (detail.event.status !== "draft") {
      throw ApiError.conflict(
        detail.event.status === "published"
          ? MANAGE_ACTION_COPY.alreadyPublished
          : MANAGE_ACTION_COPY.notADraft,
      );
    }

    const event = await db.events.update(detail.event.id, {
      status: "published",
    });
    if (!event) throw ApiError.conflict(MANAGE_ACTION_COPY.stale);

    return jsonOk({ event });
  },
);
