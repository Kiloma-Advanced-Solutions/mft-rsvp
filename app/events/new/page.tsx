import { notFound } from "next/navigation";

import { EventForm } from "@/components/events/EventForm";
import { PageHeader } from "@/components/ui";
import { UNLIMITED } from "@/lib/eventInput";
import type { EventFormValues } from "@/lib/eventInput";
import { BOARD_LABELS, MANAGE_LABELS } from "@/lib/labels";
import { canCreateEvent } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";

export const metadata = {
  title: MANAGE_LABELS.createTitle,
};

/**
 * Creating an event.
 *
 * A page rather than a modal: the form is long enough to want the width, and
 * giving creation a URL is what makes its permission testable the way every
 * other rule in this project is tested -- open it as Priya and it 404s.
 *
 * This is not a second *edit* screen. Editing happens in place on
 * `/events/[id]`, and both use the same `EventForm`, so there is one form in
 * the codebase rather than two that can drift apart.
 *
 * A Server Component. It authorises and renders; `POST /api/events` authorises
 * again from the session before it writes, so this check is the affordance and
 * that one is the boundary.
 */
export default async function NewEventPage() {
  const viewer = await getCurrentUser();

  // `notFound()` rather than a bespoke screen: it is the response this codebase
  // already gives for a route you may not have, and the API refuses too.
  if (!canCreateEvent(viewer)) notFound();

  return (
    <div>
      {/* The same trail the detail page uses, in place of a back link. */}
      <PageHeader
        breadcrumbs={[
          { label: BOARD_LABELS.title, href: "/events" },
          { label: MANAGE_LABELS.createTitle },
        ]}
        title={MANAGE_LABELS.createTitle}
        description={MANAGE_LABELS.createDescription}
        centerTitle
      />

      {/* The form sets out its own section cards. */}
      <EventForm mode={{ kind: "create" }} initialValues={BLANK_EVENT} />
    </div>
  );
}

/**
 * What a new event starts as.
 *
 * The timestamps are deliberately empty: an event's date is the one thing
 * nobody can guess, and a prefilled default is how an event ends up scheduled
 * for a time the host never chose. The two defaults that are set are the ones
 * with an obvious least-surprising answer, and both are still visible and
 * changeable in the form.
 */
const BLANK_EVENT: EventFormValues = {
  title: "",
  summary: "",
  description: "",
  startsAt: "",
  endsAt: "",
  category: "",
  access: "open",
  // No limit to start with, and said explicitly: a blank number box on its own
  // no longer means unlimited.
  capacity: "",
  capacityUnlimited: UNLIMITED,
  locationKind: "in_person",
  locationVenue: "",
  locationAddress: "",
  locationUrl: "",
  locationPlatform: "",
};
