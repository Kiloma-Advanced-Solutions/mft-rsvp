import { Badge, Card, Person } from "@/components/ui";
import {
  ATTENDEE_LABELS,
  DETAIL_LABELS,
  attendeeRestoreClosedNote,
} from "@/lib/labels";
import type { EventRecord, ManagedAttendee, User } from "@/lib/types";

import { AttendeeActions } from "./AttendeeActions";
import styles from "./AttendeeList.module.css";

/**
 * Who is going — and, for a host, the action beside each of them and the people
 * who were removed.
 *
 * A Server Component, and it derives nothing. `managed` is built by
 * `lib/events.ts` only for a viewer who may manage the event, with every row's
 * availability already worked out; the page passes `null` for everyone else,
 * who get the plain list they always had. Registration ids and the removed
 * group therefore never reach a viewer who is not a host.
 *
 * `goingCount` rather than a length is the headline, because only `going` rows
 * count and a row whose person has left the company still holds a place.
 *
 * The one interactive part is `AttendeeActions`, which receives an id, a name
 * and what it may do — nothing about anybody else.
 */
export function AttendeeList({
  event,
  attendees,
  goingCount,
  managed,
}: {
  event: Pick<EventRecord, "id" | "access">;
  attendees: User[];
  goingCount: number;
  /** The host's view of the same rows, or `null` for anyone who is not one. */
  managed: ManagedAttendee[] | null;
}) {
  return (
    <section>
      <div className={styles.head}>
        <h2 className={styles.title}>{DETAIL_LABELS.attendees}</h2>
        {goingCount > 0 && <Badge tone="neutral">{goingCount}</Badge>}
      </div>

      {managed === null ? (
        <People attendees={attendees} />
      ) : (
        <ManagedPeople event={event} managed={managed} />
      )}
    </section>
  );
}

/** The list everybody but a host sees, unchanged from before M8. */
function People({ attendees }: { attendees: User[] }) {
  if (attendees.length === 0) {
    return <p className={styles.muted}>{DETAIL_LABELS.noAttendees}</p>;
  }

  return (
    <div className={styles.people}>
      {attendees.map((attendee) => (
        <Person key={attendee.id} user={attendee} size="sm" />
      ))}
    </div>
  );
}

/**
 * The host's list. A confirmed attendee gets a remove button only where the
 * rule allows it; where it does not — an open event, somebody who manages the
 * event, an event that is cancelled or over — the chip is exactly what a member
 * sees, and the page's own notices say why the event is closed.
 */
function ManagedPeople({
  event,
  managed,
}: {
  event: Pick<EventRecord, "id" | "access">;
  managed: ManagedAttendee[];
}) {
  const going = managed.filter((row) => row.status === "going");
  const removed = managed.filter((row) => row.status === "removed");

  return (
    <>
      {going.length === 0 ? (
        <p className={styles.muted}>
          {removed.length > 0
            ? ATTENDEE_LABELS.noConfirmedAttendees
            : DETAIL_LABELS.noAttendees}
        </p>
      ) : (
        <div className={styles.people}>
          {going.map((row) => (
            <div key={row.registrationId} className={styles.attendee}>
              <Person user={row.attendee} size="sm" />
              {row.removal.state === "open" && (
                <AttendeeActions
                  eventId={event.id}
                  registrationId={row.registrationId}
                  attendeeName={row.attendee.name}
                  action="remove"
                  inviteOnly={event.access === "invite"}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/*
        Kept apart from the confirmed list, the way the queue keeps rejected
        requests apart from pending ones: these people are not coming, but a
        host can still return them.
      */}
      {removed.length > 0 && (
        <>
          <h3 className={styles.groupTitle}>{ATTENDEE_LABELS.removedTitle}</h3>
          <p className={styles.description}>
            {ATTENDEE_LABELS.removedDescription}
          </p>
          <div className={styles.rows}>
            {removed.map((row) => (
              <RemovedRow key={row.registrationId} eventId={event.id} row={row} />
            ))}
          </div>
        </>
      )}
    </>
  );
}

/**
 * One removed attendee. Restore is offered wherever the rule allows it, and
 * shown disabled when the only thing in the way is a full event — a greyed-out
 * button beside "the event is full" reads better than one that silently
 * vanishes, as the queue's approve button does. Any other reason — an open
 * event, or one that is cancelled or over — leaves the note alone.
 */
function RemovedRow({
  eventId,
  row,
}: {
  eventId: string;
  row: Extract<ManagedAttendee, { status: "removed" }>;
}) {
  const { restore } = row;
  const offered =
    restore.state === "open" ||
    (restore.state === "closed" && restore.reason === "full");

  return (
    <Card subtle elevation="flat" padding="sm">
      <div className={styles.row}>
        <div className={styles.attendee}>
          <Person user={row.attendee} size="sm" />
          {offered && (
            <AttendeeActions
              eventId={eventId}
              registrationId={row.registrationId}
              attendeeName={row.attendee.name}
              action="restore"
              disabled={restore.state !== "open"}
            />
          )}
        </div>

        {!row.attendeeCanView && (
          <p className={styles.warning}>{ATTENDEE_LABELS.attendeeCannotView}</p>
        )}

        {restore.state === "closed" && (
          <p className={styles.note}>
            {attendeeRestoreClosedNote(restore.reason)}
          </p>
        )}
      </div>
    </Card>
  );
}
