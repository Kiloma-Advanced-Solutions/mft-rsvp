/**
 * What sending an email can come back with.
 *
 * Results rather than exceptions, as the organization's reference does: an
 * expected failure -- the mail service is not configured, slow, unreachable or
 * refusing -- is a value the caller maps to a response, and only a genuine
 * programming error escapes as a throw.
 *
 * `status` and `detail` are for the server log. Nothing on this side of the
 * route may send them to a client: `detail` can quote the mail service's own
 * response body.
 */

/**
 * The organization's `SendMailResult`, plus `no_sender_config`. The reference
 * wrote its sender identity into the transport; here it is configuration, so
 * "not configured" has a second form.
 */
export type SendMailResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_api_url"
        | "no_sender_config"
        | "timeout"
        | "network"
        | "bad_status";
      status?: number;
      detail?: string;
    };

/**
 * Sending the event-share email: the transport's results, or a refusal before
 * the transport was reached.
 *
 * `invalid_target_email` is the reference's own reason for an address that
 * fails `isPlausibleRecipientEmail()`. `render_failed` is new: the reference
 * reported a template that failed to render as `network`, and a broken
 * template is not something the mail service can be blamed for, nor something
 * retrying will fix.
 */
export type SendEventShareEmailResult =
  | SendMailResult
  | { ok: false; reason: "invalid_target_email" | "render_failed" };
