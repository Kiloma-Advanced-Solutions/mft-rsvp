/**
 * Renders the event-share email and hands it to the mail service. SERVER ONLY.
 *
 * Follows the organization's reference service: render the React Email
 * template to HTML, build the plain-text part from the same data, send both
 * through `sendMail`. Both parts come from one `EventShareEmailContent`, so the
 * HTML a client shows and the text another falls back to say the same thing.
 *
 * Presentation and delivery only. It decides nothing about who may send, who
 * may receive, or whether the recipient can see the event -- the route that
 * calls it has already settled all of that against the session and the rules
 * in `lib/permissions.ts`. Everything arrives explicitly, the link included:
 * `eventUrl` is what `buildEventShareUrl()` produced, and nothing here knows
 * the application's base URL.
 *
 * What it does check is the one thing the reference checked before sending --
 * that the recipient address is plausible -- so a bad address never reaches
 * the mail service.
 */

import "server-only";

import { render } from "@react-email/render";
import { createElement } from "react";

import EventShareEmail from "@/emails/eventShareEmail";
import { buildEventShareEmailText } from "@/lib/emails/buildEventShareEmailText";
import { toEventShareEmailContent } from "@/lib/emails/eventShareEmailContent";
import { isPlausibleRecipientEmail } from "@/lib/emails/recipientEmail";
import type { SendEventShareEmailResult } from "@/lib/emails/types";
import { sendMail } from "@/lib/services/emailService";
import type { EventRecord } from "@/lib/types";

export type SendEventShareEmailParams = {
  recipientEmail: string;
  recipientName: string;
  /** Who shared the event. Named in the message; not the transport sender. */
  senderName: string;
  event: Pick<
    EventRecord,
    "title" | "summary" | "startsAt" | "endsAt" | "location" | "access"
  >;
  /** From `buildEventShareUrl()`. */
  eventUrl: string;
  timeoutMs: number;
};

export async function sendEventShareEmail({
  recipientEmail,
  recipientName,
  senderName,
  event,
  eventUrl,
  timeoutMs,
}: SendEventShareEmailParams): Promise<SendEventShareEmailResult> {
  if (!isPlausibleRecipientEmail(recipientEmail)) {
    return { ok: false, reason: "invalid_target_email" };
  }

  const content = toEventShareEmailContent(event, {
    recipientName,
    senderName,
    eventUrl,
  });

  let html: string;
  try {
    html = await render(createElement(EventShareEmail, content));
  } catch (err) {
    // A template fault, not a delivery one: report it as such rather than as
    // `network`, so the caller does not suggest that trying again would help.
    console.error("sendEventShareEmail: failed to render the email", err);
    return { ok: false, reason: "render_failed" };
  }

  return sendMail({
    to: [recipientEmail.trim()],
    subject: content.subject,
    html,
    text: buildEventShareEmailText(content),
    timeoutMs,
  });
}
