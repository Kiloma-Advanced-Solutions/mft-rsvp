/**
 * The caller's own place at one event.
 *
 *   POST   /api/events/[id]/registrations  -> { registration }   register, or request a place
 *   DELETE /api/events/[id]/registrations  -> { registration }   withdraw
 *
 * Follows the house style in `app/api/session/route.ts`: every export wrapped
 * in `withErrorHandling`, an `ApiError` for anything the caller got wrong, a
 * plain object on success.
 *
 * This file decides nothing. Identity comes from `getCurrentUser()`, visibility
 * from `lib/events.ts`, and the registration rules from `lib/permissions.ts` --
 * the same three answers the detail page gets, so a screen and a route cannot
 * drift apart. What is left here, and lives nowhere else, is the mapping from a
 * `RegistrationAvailability` onto an HTTP status.
 *
 * Nothing in the request body is read. The caller cannot choose who is acting,
 * what status results, or whether the action is allowed: the acting user is the
 * session cookie, and the resulting status is decided by the event's access
 * mode. Both handlers are safe to call with no body at all.
 */

import { ApiError, jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getEventDetailForViewer } from "@/lib/events";
import {
  REGISTRATION_ACTION_COPY,
  registrationClosedNote,
} from "@/lib/labels";
import { getRegistrationAvailability } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type {
  EventDetailContext,
  RegistrationAvailability,
  RegistrationClosedReason,
  User,
} from "@/lib/types";

type Context = RouteContext<"/api/events/[id]/registrations">;

/**
 * The viewer, and the event if they are allowed to see it.
 *
 * `getEventDetailForViewer` returns `null` for an event that does not exist and
 * for one the viewer may not see alike, so both leave here as the same 404 with
 * the same message -- `TASKS.md` section 4 requires that, because a 403 would
 * confirm the event exists. It runs before anything reads the request, so a
 * malformed or empty body cannot produce a different answer for a hidden event
 * than for a missing one.
 */
async function loadVisibleEvent(
  context: Context,
): Promise<{ viewer: User; detail: EventDetailContext }> {
  const [viewer, { id }] = await Promise.all([
    getCurrentUser(),
    context.params,
  ]);

  const detail = await getEventDetailForViewer(id, viewer);
  if (!detail) throw ApiError.notFound();

  return { viewer, detail };
}

/**
 * Re-derived from the store on every request, so a stale page, a disabled
 * button or a hand-written `curl` all get the same answer.
 */
function availabilityFor(
  detail: EventDetailContext,
  viewer: User,
): RegistrationAvailability {
  return getRegistrationAvailability(detail.event, viewer, {
    goingCount: detail.goingCount,
    viewerRegistration: detail.viewerRegistration,
  });
}

/**
 * A closed registration is a conflict with the event's current state rather
 * than a missing permission -- except `not_invited`, which is the one genuine
 * permission gap. It is only reachable by someone who can already see the
 * event, so a 403 there reveals nothing a 404 would have hidden.
 */
function closedRefusal(reason: RegistrationClosedReason): ApiError {
  return reason === "not_invited"
    ? ApiError.forbidden(registrationClosedNote(reason))
    : ApiError.conflict(registrationClosedNote(reason));
}

/** Why a register attempt was refused. Called only when the state is not `open`. */
function registerRefusal(availability: RegistrationAvailability): ApiError {
  return availability.state === "closed"
    ? closedRefusal(availability.reason)
    : ApiError.conflict(REGISTRATION_ACTION_COPY.alreadyRegistered);
}

/** Why a withdrawal was refused. Called only when the state is not `registered`. */
function withdrawRefusal(availability: RegistrationAvailability): ApiError {
  return availability.state === "closed"
    ? closedRefusal(availability.reason)
    : ApiError.conflict(REGISTRATION_ACTION_COPY.nothingToWithdraw);
}

/**
 * Register, or request a place on an `approval` event.
 *
 * The access mode decides which of the two happens; the caller does not get a
 * say. Someone who withdrew earlier keeps their original row rather than
 * gaining a second one -- but reviving it is gated on the availability computed
 * above, so a row left over from before the event filled up, was cancelled or
 * started buys no way back in.
 */
export const POST = withErrorHandling(
  async (_request: Request, context: Context) => {
    const { viewer, detail } = await loadVisibleEvent(context);

    const availability = availabilityFor(detail, viewer);
    if (availability.state !== "open") throw registerRefusal(availability);

    const status = availability.action === "request" ? "pending" : "going";
    const existing = detail.viewerRegistration;

    const registration = existing
      ? await db.registrations.update(existing.id, {
          status,
          // A revived row starts a new cycle, so nothing from the previous one
          // carries over. A stale decision would show a host in the approval
          // queue as having already decided a request that has only just been
          // made, and a stale message would put words the requester wrote for
          // the last cycle under a request they have not written one for.
          message: undefined,
          decidedBy: undefined,
          decidedAt: undefined,
        })
      : await db.registrations.create({
          eventId: detail.event.id,
          userId: viewer.id,
          status,
        });

    if (!registration) throw ApiError.conflict(REGISTRATION_ACTION_COPY.stale);

    return jsonOk({ registration });
  },
);

/**
 * Withdraw: whoever is `going` or `pending` steps back out, and may register
 * again afterwards.
 *
 * The row is kept and set to `cancelled` rather than deleted, which is what
 * `TASKS.md` section 4 asks for and what keeps one registration per person per
 * event. Whether withdrawing is offered at all is `getRegistrationAvailability`'s
 * answer, so an event that has been cancelled or has already started closes
 * this the same way it closes registering, and the screen and the route say the
 * same thing.
 */
export const DELETE = withErrorHandling(
  async (_request: Request, context: Context) => {
    const { viewer, detail } = await loadVisibleEvent(context);

    const availability = availabilityFor(detail, viewer);
    const existing = detail.viewerRegistration;

    // `registered` implies a row; the second half is what proves it to the
    // compiler rather than a case that can actually happen.
    if (availability.state !== "registered" || !existing) {
      throw withdrawRefusal(availability);
    }

    const registration = await db.registrations.update(existing.id, {
      status: "cancelled",
    });

    if (!registration) throw ApiError.conflict(REGISTRATION_ACTION_COPY.stale);

    return jsonOk({ registration });
  },
);
