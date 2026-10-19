/**
 * Everything the event-share email says, worked out once.
 *
 * The HTML template (`emails/eventShareEmail.tsx`) and the plain-text part
 * (`buildEventShareEmailText.ts`) both render this, and neither formats
 * anything itself -- so the two parts of one message cannot disagree about a
 * date, a sentence or a link.
 *
 * Pure: no store, no session, no environment. The link arrives already built,
 * by `buildEventShareUrl()` in `lib/shareLinks.ts`, which stays the only place
 * an event's URL is made; nothing on the email side knows the base URL.
 *
 * It takes only the fields the message shows. The description, the attendees,
 * capacity, the meeting link and who else is invited stay on the event page:
 * the email is there to let somebody recognise the event and open it.
 */

import { formatEmailDate, formatEmailTimeRange } from "@/lib/date";
import {
  LOCATION_KIND_LABELS,
  eventShareAccessNote,
  eventShareEmailGreeting,
  eventShareEmailIntro,
  eventShareEmailSubject,
  locationLabel,
} from "@/lib/labels";
import type { EventLocation, EventRecord } from "@/lib/types";

export type EventShareEmailContent = {
  subject: string;
  greeting: string;
  intro: string;
  eventTitle: string;
  eventSummary: string;
  date: string;
  time: string;
  location: string;
  accessNote: string;
  eventUrl: string;
};

export function toEventShareEmailContent(
  event: Pick<
    EventRecord,
    "title" | "summary" | "startsAt" | "endsAt" | "location" | "access"
  >,
  {
    recipientName,
    senderName,
    eventUrl,
  }: { recipientName: string; senderName: string; eventUrl: string },
): EventShareEmailContent {
  return {
    subject: eventShareEmailSubject(event.title),
    greeting: eventShareEmailGreeting(recipientName),
    intro: eventShareEmailIntro(senderName),
    eventTitle: event.title,
    eventSummary: event.summary,
    date: formatEmailDate(event.startsAt),
    time: formatEmailTimeRange(event.startsAt, event.endsAt),
    location: emailLocation(event.location),
    accessNote: eventShareAccessNote(event.access),
    eventUrl,
  };
}

/**
 * Where, as one line: the place the board's card would name, then the street
 * address when there is one. `locationLabel()` can come back empty for a
 * hybrid event with neither a venue nor a platform, so the kind is the floor --
 * the row is never blank. An online meeting link is deliberately left out; it
 * lives on the event page with everything else.
 */
function emailLocation(location: EventLocation): string {
  const place = locationLabel(location) || LOCATION_KIND_LABELS[location.kind];
  const address = location.kind === "online" ? undefined : location.address;
  return address ? `${place}, ${address}` : place;
}
