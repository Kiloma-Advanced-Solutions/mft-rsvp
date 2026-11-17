/**
 * Sends one email through the organization's mail service. SERVER ONLY.
 *
 * The organization's reference transport, carried over: a JSON `POST` to
 * `${MAIL_SERVICE_URL}/sendMail` carrying the sender, the recipients, the
 * subject and both the HTML and plain-text parts, with a caller-supplied
 * timeout, and every expected failure returned as a `SendMailResult` rather
 * than thrown. The reference sends no credentials -- the mail service is
 * reached on the organization's network -- so neither does this.
 *
 * One deliberate difference. The reference wrote its sender identity into this
 * file; here the sender is the Events Board system, and its name, address and
 * mail-service system id are configuration, because the organization assigns
 * them and they are not known yet. Each is read on every send, like the URL,
 * and a missing or malformed one refuses the send before any request -- there
 * is no default identity to fall back to.
 *
 * Nothing here decides *whether* to send, or to whom. That is the caller's,
 * after it has checked who is asking.
 */

import "server-only";

import { isPlausibleRecipientEmail } from "@/lib/emails/recipientEmail";
import type { SendMailResult } from "@/lib/emails/types";
import { errorKind, log } from "@/lib/log";

const MAIL_SERVICE_URL_VAR = "MAIL_SERVICE_URL";
const SENDER_NAME_VAR = "EVENTS_MAIL_SENDER_NAME";
const SENDER_EMAIL_VAR = "EVENTS_MAIL_SENDER_EMAIL";
const SYSTEM_ID_VAR = "EVENTS_MAIL_SYSTEM_ID";

export type SendMailParams = {
  to: string[];
  subject: string;
  html: string;
  text: string;
  timeoutMs: number;
};

type SenderConfig = {
  senderName: string;
  senderEmail: string;
  systemID: number;
};

/**
 * The configured sender, or `null`. Logs that the sender is not configured --
 * as a code, never with the values. The variables it reads are named above.
 */
function readSenderConfig(): SenderConfig | null {
  const senderName = process.env[SENDER_NAME_VAR]?.trim() ?? "";
  const senderEmail = process.env[SENDER_EMAIL_VAR]?.trim() ?? "";
  const systemIdRaw = process.env[SYSTEM_ID_VAR]?.trim() ?? "";
  // The reference sends the id as a JSON number, so only a whole number is one.
  const systemID = /^\d+$/.test(systemIdRaw) ? Number(systemIdRaw) : NaN;

  const problems = [
    senderName === "" && SENDER_NAME_VAR,
    !isPlausibleRecipientEmail(senderEmail) && SENDER_EMAIL_VAR,
    !Number.isSafeInteger(systemID) && SYSTEM_ID_VAR,
  ].filter((name): name is string => typeof name === "string");

  if (problems.length > 0) {
    log.warn("mail.not_configured", { component: "mail", reason: "no_sender_config" });
    return null;
  }
  return { senderName, senderEmail, systemID };
}

export async function sendMail({
  to,
  subject,
  html,
  text,
  timeoutMs,
}: SendMailParams): Promise<SendMailResult> {
  const baseUrl = process.env[MAIL_SERVICE_URL_VAR]?.trim();
  if (!baseUrl) {
    log.warn("mail.not_configured", { component: "mail", reason: "no_api_url" });
    return { ok: false, reason: "no_api_url" };
  }

  const sender = readSenderConfig();
  if (!sender) return { ok: false, reason: "no_sender_config" };

  const sendUrl = `${baseUrl.replace(/\/+$/, "")}/sendMail`;

  try {
    const response = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        senderName: sender.senderName,
        senderEmail: sender.senderEmail,
        systemID: sender.systemID,
        to,
        subject,
        text,
        html,
        cc: [],
        bcc: [],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      // Bounded, as the reference bounds it. Returned to the caller, which keeps
      // it from the client; not logged, because a mail service can echo the
      // addresses and content it was sent. The status is what the log needs.
      const detail = (await response.text().catch(() => "")).slice(0, 500);
      log.error("mail.send_failed", {
        component: "mail",
        reason: "bad_status",
        status: response.status,
      });
      return {
        ok: false,
        reason: "bad_status",
        status: response.status,
        detail: detail || undefined,
      };
    }

    return { ok: true };
  } catch (err) {
    const timedOut =
      err instanceof Error &&
      (err.name === "AbortError" || err.name === "TimeoutError");
    if (timedOut) {
      log.error("mail.send_failed", { component: "mail", reason: "timeout" });
      return { ok: false, reason: "timeout" };
    }

    // Kind and code only: `fetch`'s message quotes the whole URL, credentials
    // included, and its cause names the mail service's host and port.
    log.error("mail.send_failed", { component: "mail", reason: "network", err: errorKind(err) });
    return {
      ok: false,
      reason: "network",
      detail: err instanceof Error ? err.message : undefined,
    };
  }
}
