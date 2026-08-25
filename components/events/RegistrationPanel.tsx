import { Button, Card } from "@/components/ui";
import { DETAIL_LABELS, registrationCtaCopy } from "@/lib/labels";
import type {
  EventRecord,
  Registration,
  RegistrationAvailability,
} from "@/lib/types";

import { CapacityMeter, RegistrationBadge } from "./EventMeta";
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
 * The action is deliberately inert for now — the button is in its final place
 * and shows the right label, and the note under it says so. Wiring it to the
 * registration endpoint is M3's job, and is the only change this component
 * needs then.
 */
export function RegistrationPanel({
  event,
  availability,
  goingCount,
  viewerRegistration,
}: {
  event: Pick<EventRecord, "capacity">;
  availability: RegistrationAvailability;
  goingCount: number;
  viewerRegistration: Registration | null;
}) {
  const copy = registrationCtaCopy(availability);

  return (
    <Card>
      <div className={styles.panel}>
        {viewerRegistration && (
          <div className={styles.status}>
            <RegistrationBadge status={viewerRegistration.status} size="lg" />
          </div>
        )}

        <CapacityMeter going={goingCount} capacity={event.capacity} />

        {copy.action && (
          <Button
            variant={
              availability.state === "registered" ? "secondary" : "primary"
            }
            fullWidth
            disabled
          >
            {copy.action}
          </Button>
        )}

        <p className={styles.note}>{copy.note}</p>

        {copy.action && (
          <p className={styles.inactive}>{DETAIL_LABELS.notYetActive}</p>
        )}
      </div>
    </Card>
  );
}
