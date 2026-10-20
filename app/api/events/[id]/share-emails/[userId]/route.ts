/**
 * A host emailing one person the link to an event.
 *
 *   POST /api/events/[id]/share-emails/[userId] -> { sent: true }
 *
 * One person per request, addressed by the URL like an invitation is, and with
 * **no body**: the session says who is sending, the URL says which event and
 * to whom, and everything the email carries -- the address, the names, the
 * link -- is read on the server. Nothing the client says is believed.
 *
 * It is not an invitation and changes nothing. No invite list, registration,
 * request or seat is touched; the email carries the event's canonical URL,
 * and whoever opens it is answered by `canViewEvent()` as they would be anyway.
 * That is why it only goes to somebody who can already see the event.
 *
 * It decides nothing itself: identity from `getCurrentUser()`, visibility from
 * `lib/events.ts`, every rule from `lib/permissions.ts`, the link from
 * `buildEventShareUrl()`, and rendering and delivery from
 * `sendEventShareEmail()`. What it owns is the order of the refusals and the
 * status each one gets:
 *
 *   404  the event does not exist, or the caller may not see it -- the same
 *        answer, so this cannot confirm that a hidden event exists;
 *   403  the caller can see it but may not manage it;
 *   409  sharing is closed (draft, cancelled, started);
 *   404  the recipient is not a person in the product;
 *   409  the recipient is the caller, or cannot see the event, or their stored
 *        address is not a plausible one;
 *   503  this server cannot send (no application URL or mail configuration);
 *   502  the mail service failed -- timed out, unreachable or refused;
 *   500  the email could not be rendered.
 *
 * Every refusal up to the 503 comes before the mail service is contacted.
 * Operational failures carry only a short, fixed message: the service's
 * status and response stay in the server log.
 */

import { ApiError, jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { EMAIL_API_FETCH_TIMEOUT_MS } from "@/lib/emails/recipientEmail";
import type { SendEventShareEmailResult } from "@/lib/emails/types";
import { getEventForViewer } from "@/lib/events";
import {
  MANAGE_ACTION_COPY,
  SHARE_EMAIL_ACTION_COPY,
  SHARE_LABELS,
  sharingClosedNote,
} from "@/lib/labels";
import {
  canManageEvent,
  canViewEvent,
  getSharingAvailability,
} from "@/lib/permissions";
import { sendEventShareEmail } from "@/lib/services/emails/sendEventShareEmail";
import { getCurrentUser } from "@/lib/session";
import { buildEventShareUrl } from "@/lib/shareLinks";

type Context = RouteContext<"/api/events/[id]/share-emails/[userId]">;

export const POST = withErrorHandling(
  async (_request: Request, context: Context) => {
    const [viewer, { id, userId }] = await Promise.all([
      getCurrentUser(),
      context.params,
    ]);

    // The event alone: nothing below needs the detail screen's users,
    // registrations or derived lists, and this runs once per recipient.
    const event = await getEventForViewer(id, viewer);
    if (!event) throw ApiError.notFound();

    if (!canManageEvent(event, viewer)) {
      throw ApiError.forbidden(MANAGE_ACTION_COPY.cannotManage);
    }

    const sharing = getSharingAvailability(event);
    if (sharing.state === "closed") {
      throw ApiError.conflict(sharingClosedNote(sharing.reason));
    }

    // A malformed id is answered with `null` by the store, like an unknown one.
    const recipient = await db.users.get(userId);
    if (!recipient) throw ApiError.notFound();

    if (recipient.id === viewer.id) {
      throw ApiError.conflict(SHARE_EMAIL_ACTION_COPY.self);
    }
    if (!canViewEvent(event, recipient)) {
      throw ApiError.conflict(SHARE_EMAIL_ACTION_COPY.recipientCannotView);
    }

    const eventUrl = buildEventShareUrl(event.id);
    if (!eventUrl) {
      throw new ApiError(503, SHARE_LABELS.unavailable, {
        code: "share_unavailable",
      });
    }

    const result = await sendEventShareEmail({
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      senderName: viewer.name,
      event,
      eventUrl,
      timeoutMs: EMAIL_API_FETCH_TIMEOUT_MS,
    });

    if (result.ok) return jsonOk({ sent: true });
    throw sendFailure(result.reason);
  },
);

/**
 * A failed send as a response. Fixed messages only -- `status` and `detail`
 * from the transport never reach the client.
 */
function sendFailure(
  reason: Extract<SendEventShareEmailResult, { ok: false }>["reason"],
): ApiError {
  switch (reason) {
    case "invalid_target_email":
      return ApiError.conflict(SHARE_EMAIL_ACTION_COPY.invalidRecipientEmail);
    case "no_api_url":
    case "no_sender_config":
      return new ApiError(503, SHARE_EMAIL_ACTION_COPY.notConfigured, {
        code: "email_not_configured",
      });
    case "timeout":
    case "network":
    case "bad_status":
      return new ApiError(502, SHARE_EMAIL_ACTION_COPY.deliveryFailed, {
        code: "email_delivery_failed",
      });
    case "render_failed":
      return new ApiError(500, SHARE_EMAIL_ACTION_COPY.renderFailed, {
        code: "email_render_failed",
      });
  }
}
