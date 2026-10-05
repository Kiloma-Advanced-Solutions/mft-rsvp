/**
 * A host inviting one existing person to an event, or revoking that invitation.
 *
 *   POST   /api/events/[id]/invitations/[userId] -> 201 { invitation: { eventId, userId } }
 *   DELETE /api/events/[id]/invitations/[userId] -> { revoked: true }
 *
 * An invitation is one `(event, person)` row that either exists or does not, so
 * it is addressed by that pair and created or deleted there -- the same POST /
 * DELETE pair the caller's own registration uses, rather than the verb routes a
 * registration row needs for its several transitions. Both handlers read **no
 * body**: the session says who is acting, the URL says which event and which
 * person, and the method says which change. `[userId]` is the *target* of the
 * action and never the actor.
 *
 * An invitation is not a registration. Inviting writes no registration -- the
 * person can now see the event and register through the ordinary flow -- and
 * revoking leaves whatever registration they hold exactly as it is, a `going`
 * place included.
 *
 * It decides nothing itself: identity from `getCurrentUser()`, visibility from
 * `lib/events.ts`, manageability and both rules from `lib/permissions.ts`.
 */

import { ApiError, jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { getEventDetailForViewer } from "@/lib/events";
import {
  MANAGE_ACTION_COPY,
  invitationClosedNote,
  invitationRevocationClosedNote,
} from "@/lib/labels";
import {
  canManageEvent,
  getInvitationAvailability,
  getInvitationRevocationAvailability,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { EventDetailContext, User } from "@/lib/types";

type Context = RouteContext<"/api/events/[id]/invitations/[userId]">;

/**
 * The event and the person the caller is acting on, in the order `remove` and
 * `restore` refuse in -- and the order is the security property:
 *
 *   - 404 for an event that does not exist and for one the caller may not see
 *     alike, so this endpoint cannot confirm that an invite-only event exists;
 *   - 403 for a caller who can see the event but may not manage it;
 *   - 404 for a target who is not a person in the product -- a malformed id
 *     included, which `db.users.get` answers with `null` rather than a driver
 *     error. Who the people are is no secret (`GET /api/session` lists them),
 *     but this is only reached by a manager anyway.
 *
 * Every refusal comes before any write, and nothing reads a body.
 */
async function loadInvitationTarget(
  context: Context,
): Promise<{ detail: EventDetailContext; invitee: User }> {
  const [viewer, { id, userId }] = await Promise.all([
    getCurrentUser(),
    context.params,
  ]);

  const detail = await getEventDetailForViewer(id, viewer);
  if (!detail) throw ApiError.notFound();

  if (!canManageEvent(detail.event, viewer)) {
    throw ApiError.forbidden(MANAGE_ACTION_COPY.cannotManage);
  }

  const invitee = await db.users.get(userId);
  if (!invitee) throw ApiError.notFound();

  return { detail, invitee };
}

/**
 * Invite: the person may see the event from now on, and register like anyone
 * else who can.
 *
 * The rule is asked twice, as the seat claims ask theirs. Here on the event
 * this request loaded, for the words a refusal should carry; then by
 * `db.events.invite` again with the event row locked, which is the answer that
 * counts -- a request that loses a race to another invite, an access change or
 * a cancellation is refused with the reason that is true now.
 */
export const POST = withErrorHandling(
  async (_request: Request, context: Context) => {
    const { detail, invitee } = await loadInvitationTarget(context);

    const availability = getInvitationAvailability(detail.event, { invitee });
    if (availability.state === "closed") {
      throw ApiError.conflict(invitationClosedNote(availability.reason));
    }

    const write = await db.events.invite(detail.event.id, invitee);

    switch (write.outcome) {
      case "invited":
        return jsonOk(
          { invitation: { eventId: detail.event.id, userId: invitee.id } },
          201,
        );
      case "refused":
        // Every refused outcome carries a closed availability; the fallback is
        // what proves that to the compiler rather than a case that can happen.
        throw ApiError.conflict(
          write.availability.state === "closed"
            ? invitationClosedNote(write.availability.reason)
            : MANAGE_ACTION_COPY.stale,
        );
      case "gone":
        // Deleted while this request was in flight -- the same 404 as an event
        // that never existed.
        throw ApiError.notFound();
    }
  },
);

/**
 * Revoke: the person may no longer see the event, unless they manage it.
 *
 * Open on a cancelled event and on one that has started, unlike inviting:
 * revoking only narrows who can see the event, and a host may still need to
 * take access to it back. Their registration is not touched -- removing a
 * confirmed place is the attendee list's own action.
 */
export const DELETE = withErrorHandling(
  async (_request: Request, context: Context) => {
    const { detail, invitee } = await loadInvitationTarget(context);

    const availability = getInvitationRevocationAvailability(detail.event, {
      inviteeId: invitee.id,
    });
    if (availability.state === "closed") {
      throw ApiError.conflict(
        invitationRevocationClosedNote(availability.reason),
      );
    }

    const revocation = await db.events.revokeInvitation(
      detail.event.id,
      invitee,
    );

    switch (revocation.outcome) {
      case "revoked":
        return jsonOk({ revoked: true });
      case "refused":
        throw ApiError.conflict(
          revocation.availability.state === "closed"
            ? invitationRevocationClosedNote(revocation.availability.reason)
            : MANAGE_ACTION_COPY.stale,
        );
      case "gone":
        throw ApiError.notFound();
    }
  },
);
