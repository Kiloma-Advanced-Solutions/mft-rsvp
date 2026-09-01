/**
 * Editing and deleting one event.
 *
 *   PATCH  /api/events/[id]  -> { event }        body: any of the nine content fields
 *   DELETE /api/events/[id]  -> { deleted: true }
 *
 * `PATCH` is strictly a content editor. It cannot change `status`, `accent`,
 * `organizerId`, `coHostIds` or `invitedUserIds`, because `parseEventBody` does
 * not read those fields -- publishing is `POST /api/events/[id]/publish`, and
 * the rest are not editable in this milestone at all. The protection is that
 * the field is absent, not that it is checked.
 *
 * Neither handler decides who may act. Identity comes from `getCurrentUser()`,
 * visibility from `lib/events.ts` and manageability from `lib/permissions.ts` --
 * the same three answers the detail page gets, re-derived from the store on
 * every request, so a stale page, a hidden control or a hand-written `curl` all
 * get the same answer.
 */

import { ApiError, jsonOk, readJson, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getEventDetailForViewer } from "@/lib/events";
import { parseEventBody } from "@/lib/eventInput";
import { EVENT_FORM_ERRORS, MANAGE_ACTION_COPY } from "@/lib/labels";
import { canManageEvent } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { EventDetailContext } from "@/lib/types";

type Context = RouteContext<"/api/events/[id]">;

/**
 * The event, if the caller is allowed to see *and* manage it.
 *
 * The acting user is resolved here but not returned: neither handler needs an
 * identity of its own once the two questions below have been answered.
 *
 * Two refusals, in this order, and the order is the security property:
 *
 *   - `getEventDetailForViewer` returns `null` for an event that does not exist
 *     and for one the viewer may not see alike, so both leave as the same 404.
 *     A 403 here would confirm a draft or an invite-only event exists.
 *   - only then does manageability apply, as a 403. It is reachable only by
 *     someone who can already see the event, so it reveals nothing a 404 was
 *     hiding -- the same reasoning the registrations route applies to
 *     `not_invited`.
 *
 * Both run before anything reads the request body, so a malformed body cannot
 * produce a different answer for a hidden event than for a missing one.
 */
async function loadManageableEvent(
  context: Context,
): Promise<EventDetailContext> {
  const [viewer, { id }] = await Promise.all([
    getCurrentUser(),
    context.params,
  ]);

  const detail = await getEventDetailForViewer(id, viewer);
  if (!detail) throw ApiError.notFound();

  if (!canManageEvent(detail.event, viewer)) {
    throw ApiError.forbidden(MANAGE_ACTION_COPY.cannotManage);
  }

  return detail;
}

/**
 * Edit the event's content.
 *
 * Every field is optional, and the stored record supplies whatever the request
 * leaves out -- so the rules are checked against the event as it *would be*,
 * not against the patch alone. That is what makes a request carrying only
 * `endsAt` still get tested against the stored `startsAt`.
 */
export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    const detail = await loadManageableEvent(context);

    const body = await readJson(request);
    const parsed = parseEventBody(body, detail.event);
    if (!parsed.ok) {
      throw ApiError.badRequest(EVENT_FORM_ERRORS.formRejected, parsed.errors);
    }

    const event = await db.events.update(detail.event.id, parsed.value);
    if (!event) throw ApiError.conflict(MANAGE_ACTION_COPY.stale);

    return jsonOk({ event });
  },
);

/**
 * Delete the event.
 *
 * `db.events.remove()` takes the event's registrations with it, which is why
 * the dialog in front of this says how many people lose a place. No body is
 * read; this handler is safe to call with none at all.
 */
export const DELETE = withErrorHandling(
  async (_request: Request, context: Context) => {
    const detail = await loadManageableEvent(context);

    const deleted = await db.events.remove(detail.event.id);
    // Only reachable if it disappeared between the load and here, which is the
    // same answer as never having existed.
    if (!deleted) throw ApiError.notFound();

    return jsonOk({ deleted: true });
  },
);
