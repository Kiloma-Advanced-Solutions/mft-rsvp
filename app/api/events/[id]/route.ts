/**
 * Editing and deleting one event.
 *
 *   PATCH  /api/events/[id]  -> { event }        body: any of the nine content fields
 *   DELETE /api/events/[id]  -> { deleted: true }
 *
 * `PATCH` is strictly a content editor. It cannot change `status`, `accent`,
 * `organizerId`, `coHostIds` or `invitedUserIds`, because `parseEventBody` does
 * not read those fields -- publishing is `POST /api/events/[id]/publish`, who is
 * invited changes one person at a time through
 * `/api/events/[id]/invitations/[userId]`, and the rest are not editable at
 * all. The protection is that the field is absent, not that it is checked.
 *
 * Neither handler decides who may act. Identity comes from `getCurrentUser()`,
 * visibility from `lib/events.ts` and manageability from `lib/permissions.ts` --
 * the same three answers the detail page gets, re-derived from the store on
 * every request, so a stale page, a hidden control or a hand-written `curl` all
 * get the same answer.
 */

import { ApiError, jsonOk, readJson, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { eventExists, getEventDetailForViewer } from "@/lib/events";
import { parseEventBody } from "@/lib/eventInput";
import {
  EVENT_FORM_ERRORS,
  MANAGE_ACTION_COPY,
  scheduleFieldErrors,
} from "@/lib/labels";
import { canManageEvent, checkEventSchedule } from "@/lib/permissions";
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
 * `endsAt` still get tested against the stored `startsAt`, and what lets the
 * form leave out the dates of an event whose dates are locked.
 */
export const PATCH = withErrorHandling(
  async (request: Request, context: Context) => {
    const detail = await loadManageableEvent(context);

    const body = await readJson(request);
    const parsed = parseEventBody(body, detail.event);
    if (!parsed.ok) {
      throw ApiError.badRequest(EVENT_FORM_ERRORS.formRejected, parsed.errors);
    }

    // Judged against the event as stored: only a date that actually changes is
    // checked, and a started or cancelled event's dates do not change at all.
    // One clock reading, and it is the server's.
    const schedule = checkEventSchedule(detail.event, parsed.value, Date.now());
    if (!schedule.ok) {
      throw ApiError.badRequest(
        EVENT_FORM_ERRORS.formRejected,
        scheduleFieldErrors(schedule.errors),
      );
    }

    const event = await db.events.update(detail.event.id, parsed.value);
    if (!event) {
      // Nothing written. Either the event was deleted between the read above
      // and this write -- the same 404 as an event that never existed -- or it
      // is still there and the row moved first, which stays a conflict.
      throw (await eventExists(detail.event.id))
        ? ApiError.conflict(MANAGE_ACTION_COPY.stale)
        : ApiError.notFound();
    }

    return jsonOk({ event });
  },
);

/**
 * Delete the event.
 *
 * `db.events.remove()` soft-deletes it: the event becomes nonexistent to every
 * reader, and its registrations go out of reach with it -- kept in the
 * database, but no longer anybody's place -- which is why the dialog in front
 * of this says how many people lose a place. A second delete finds no live
 * event and is a 404. No body is read; this handler is safe to call with none
 * at all.
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
