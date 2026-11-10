import { Card } from "@/components/ui";
import { isPast } from "@/lib/date";
import {
  DETAIL_LABELS,
  closedAttendanceLabel,
  hostParticipationNote,
  registrationCtaCopy,
} from "@/lib/labels";
import type {
  EventRecord,
  Registration,
  RegistrationAvailability,
} from "@/lib/types";

import { CapacityMeter, ViewerRegistrationBadge } from "./EventMeta";
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
 *
 * An event that has already started drops the meter for the same reason, but
 * keeps a plain headcount in its place -- the same words a closed event's card
 * uses.
 *
 * For one of the event's hosts -- `viewerIsHost`, from `isHost()` -- it is a
 * participation panel instead, whatever closed registration: titled for that,
 * with no badge and no action, only the headcount and, for a draft, cancelled
 * or past event, the line that says so. A host has no registration, so nothing
 * here mentions one. The headcount stays on a cancelled event too, as a plain
 * count: the panel is about who takes part, and has nothing else to say.
 */
export function RegistrationPanel({
  event,
  availability,
  attendanceCount,
  viewerRegistration,
  viewerIsHost,
}: {
  event: Pick<EventRecord, "id" | "capacity" | "status" | "startsAt">;
  availability: RegistrationAvailability;
  attendanceCount: number;
  viewerRegistration: Registration | null;
  viewerIsHost: boolean;
}) {
  const copy = viewerIsHost
    ? { action: null, note: hostParticipationNote(availability) }
    : registrationCtaCopy(availability, viewerRegistration?.status ?? null);

  const cancelled = event.status === "cancelled";
  // Everyone but a host loses the headcount on a cancelled event.
  const showCount = viewerIsHost || !cancelled;

  return (
    <Card>
      <section className={styles.panel}>
        <div className={styles.head}>
          <h2 className={styles.title}>
            {viewerIsHost
              ? DETAIL_LABELS.participation
              : DETAIL_LABELS.registration}
          </h2>
          {viewerRegistration && !viewerIsHost && (
            <ViewerRegistrationBadge
              status={viewerRegistration.status}
              size="lg"
            />
          )}
        </div>

        {showCount &&
          (cancelled || isPast(event.startsAt) ? (
            <p className={styles.count}>{closedAttendanceLabel(attendanceCount)}</p>
          ) : (
            <CapacityMeter going={attendanceCount} capacity={event.capacity} />
          ))}

        {copy.action && (
          <RegistrationActions
            eventId={event.id}
            availability={availability}
            label={copy.action}
          />
        )}

        {copy.note && <p className={styles.note}>{copy.note}</p>}
      </section>
    </Card>
  );
}
