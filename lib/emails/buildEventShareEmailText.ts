/**
 * The plain-text part of the event-share email.
 *
 * Built from the same `EventShareEmailContent` as the HTML template rather than
 * by stripping the rendered HTML, so it is written as text -- labelled lines, a
 * bare link -- and says exactly what the HTML says. Some clients show only this
 * part, so the link is on a line of its own where any of them can open it.
 */

import { EMAIL_LABELS, EVENT_SHARE_EMAIL_LABELS } from "@/lib/labels";

import type { EventShareEmailContent } from "./eventShareEmailContent";

export function buildEventShareEmailText(
  content: EventShareEmailContent,
): string {
  return [
    content.greeting,
    "",
    content.intro,
    "",
    content.eventTitle,
    content.eventSummary,
    "",
    `${EVENT_SHARE_EMAIL_LABELS.date}: ${content.date}`,
    `${EVENT_SHARE_EMAIL_LABELS.time}: ${content.time}`,
    `${EVENT_SHARE_EMAIL_LABELS.location}: ${content.location}`,
    "",
    content.accessNote,
    "",
    EVENT_SHARE_EMAIL_LABELS.linkLine,
    content.eventUrl,
    "",
    "--",
    EMAIL_LABELS.autoSentFooter,
  ].join("\n");
}
