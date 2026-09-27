import { Card } from "@/components/ui";
import { registrationCtaCopy } from "@/lib/labels";
import type {
  EventRecord,
  Registration,
  RegistrationAvailability,
} from "@/lib/types";

import { CapacityMeter, RegistrationBadge } from "./EventMeta";
import { RegistrationActions } from "./RegistrationActions";
import styles from "./RegistrationPanel.module.css";

/**
 * Where the viewer stands with this event, and the one thing they can do about
 * it: register, request a place, withdraw — or nothing, with a line saying why.
 *
 * It derives nothing. `availability` is worked out by
 * `getRegistrationAvailability()` in `lib/permissions.ts` and passed in, the
 * same contract `EventCard` follows, so the rule has one home and this file
 * only chooses how to say it.
 *
 * A Server Component. The one interactive part is `RegistrationActions`, which
 * gets the label chosen here rather than choosing its own, so the wording still
 * comes from `lib/labels.ts` alone.
 *
 * A cancelled event keeps the viewer's badge -- cancelling rewrites no
 * registration -- and the note says the event will not take place. It drops the
 * capacity meter: places left, or "full", describe an event people can still
 * join. The headcount stays in the page's attendee section.
 */
export function RegistrationPanel({
  event,
  availability,
  goingCount,
  viewerRegistration,
}: {
  event: Pick<EventRecord, "id" | "capacity" | "status">;
  availability: RegistrationAvailability;
  goingCount: number;
  viewerRegistration: Registration | null;
}) {
  const copy = registrationCtaCopy(
    availability,
    viewerRegistration?.status ?? null,
  );

  return (
    <Card>
      <div className={styles.panel}>
        {viewerRegistration && (
          <div className={styles.status}>
            <RegistrationBadge status={viewerRegistration.status} size="lg" />
          </div>
        )}

        {event.status !== "cancelled" && (
          <CapacityMeter going={goingCount} capacity={event.capacity} />
        )}

        {copy.action && (
          <RegistrationActions
            eventId={event.id}
            availability={availability}
            label={copy.action}
          />
        )}

        <p className={styles.note}>{copy.note}</p>
      </div>
    </Card>
  );
}
