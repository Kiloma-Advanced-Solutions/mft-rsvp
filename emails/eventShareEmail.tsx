/**
 * The email a host sends to share an event with somebody who can already see
 * it.
 *
 * Not an invitation. It carries the event's own link and adds nobody to the
 * invite list, registers nobody and grants nothing; whoever opens the link is
 * answered by the event page's usual visibility rules. The copy says "shared"
 * for that reason.
 *
 * Presentation only. Every word and value arrives in `EventShareEmailContent`,
 * built by `toEventShareEmailContent()` -- including the link, which
 * `buildEventShareUrl()` made on the server. This file builds no URL and reads
 * no environment, so the template, the plain-text part and the preview all
 * show the same message.
 *
 * The call to action is a link inside a coloured table cell, the full link is
 * printed under it for a client that will not open the button, and the rest is
 * `BaseEmail`'s shell. See there for why it is all tables.
 */

import { APP_LABELS, EVENT_SHARE_EMAIL_LABELS } from "@/lib/labels";
import {
  toEventShareEmailContent,
  type EventShareEmailContent,
} from "@/lib/emails/eventShareEmailContent";

import { BaseEmail, DetailRow, Spacer, styles } from "./BaseEmail/BaseEmail";

export default function EventShareEmail({
  greeting,
  intro,
  eventTitle,
  eventSummary,
  date,
  time,
  location,
  accessNote,
  eventUrl,
}: EventShareEmailContent) {
  return (
    <BaseEmail preview={intro} headerLabel={APP_LABELS.brand} title={eventTitle}>
      <p style={styles.greeting}>{greeting}</p>
      <p style={styles.paragraph}>{intro}</p>
      <p style={styles.summaryText}>{eventSummary}</p>

      <table
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        border={0}
        style={styles.detailsTable}
      >
        <tbody>
          <DetailRow label={EVENT_SHARE_EMAIL_LABELS.date} value={date} />
          <DetailRow label={EVENT_SHARE_EMAIL_LABELS.time} value={time} />
          <DetailRow label={EVENT_SHARE_EMAIL_LABELS.location} value={location} />
        </tbody>
      </table>

      <p style={styles.paragraph}>{accessNote}</p>

      <table cellPadding={0} cellSpacing={0} border={0} style={styles.ctaTable}>
        <tbody>
          <tr>
            <td align="center" style={styles.ctaCell}>
              <a href={eventUrl} style={styles.ctaLink}>
                {EVENT_SHARE_EMAIL_LABELS.openEvent}
              </a>
            </td>
          </tr>
        </tbody>
      </table>

      <Spacer height={20} />

      <p style={styles.linkFallback}>{EVENT_SHARE_EMAIL_LABELS.linkFallback}</p>
      <p style={styles.urlText} dir="ltr">
        <a href={eventUrl} style={styles.urlLink}>
          {eventUrl}
        </a>
      </p>

      <Spacer height={28} />
    </BaseEmail>
  );
}

/**
 * Sample data for `npm run email:preview` only -- never sent. It goes through
 * the same `toEventShareEmailContent()` as a real send, so the preview shows
 * real formatting: 18 October 2026 falls before Israel's clocks change, so
 * 06:30Z is 09:30 in Jerusalem. The link is on a reserved `.test` domain.
 */
EventShareEmail.PreviewProps = toEventShareEmailContent(
  {
    title: "אירוע לדוגמה: סדנת תכנון",
    summary: "תיאור קצר לדוגמה, כפי שהוא מופיע בכרטיס האירוע בלוח.",
    startsAt: "2026-10-18T06:30:00.000Z",
    endsAt: "2026-10-18T14:00:00.000Z",
    location: {
      kind: "in_person",
      venue: "חדר ישיבות לדוגמה",
      address: "רחוב הדוגמה 1, תל אביב",
    },
    access: "approval",
  },
  {
    recipientName: "נמען לדוגמה",
    senderName: "מארח לדוגמה",
    eventUrl:
      "https://events-board.example.test/events/00000000-0000-4000-8000-000000000000",
  },
) satisfies EventShareEmailContent;
