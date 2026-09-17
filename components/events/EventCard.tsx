import Link from "next/link";
import type { ReactNode } from "react";

import { AvatarStack } from "@/components/ui";
import { cx } from "@/lib/cx";
import { isPast } from "@/lib/date";
import { CATEGORY_LABELS, attendanceLabel, hostedByLabel } from "@/lib/labels";
import type { EventRecord, RegistrationStatus, User } from "@/lib/types";

import {
  AccessBadge,
  DateBlock,
  EventMetaLine,
  EventStatusBadge,
  RegistrationBadge,
} from "./EventMeta";
import styles from "./EventCard.module.css";

/**
 * The board's unit of currency. The whole card is one link to the event, which
 * is why there are no buttons inside it — nesting interactive elements inside
 * an anchor is invalid, and a card with three click targets is a card nobody
 * knows how to click.
 *
 * Everything it renders is passed in. Working out `goingCount`, who the
 * attendees are, and what the viewer's own status is, is the caller's job.
 */
export function EventCard({
  event,
  attendees = [],
  goingCount,
  viewerStatus,
  hostName,
  href,
}: {
  event: EventRecord;
  /** Confirmed attendees, for the avatar stack. A slice of 4 or so is plenty. */
  attendees?: Array<Pick<User, "id" | "name" | "initials" | "accent">>;
  /** Total confirmed attendees. Defaults to `attendees.length`. */
  goingCount?: number;
  /** The viewer's own registration status, if they have one. */
  viewerStatus?: RegistrationStatus | null;
  /** Shown bottom-right when there is no avatar stack to show. */
  hostName?: string;
  href?: string;
}) {
  const going = goingCount ?? attendees.length;
  const full = event.capacity !== null && going >= event.capacity;
  const dimmed = event.status === "cancelled" || isPast(event.startsAt);

  return (
    <Link
      href={href ?? `/events/${event.id}`}
      className={cx(styles.card, styles[event.accent], dimmed && styles.dimmed)}
    >
      <div className={styles.head}>
        <DateBlock iso={event.startsAt} accent={event.accent} />
        <div className={styles.headText}>
          <p className={styles.category}>{CATEGORY_LABELS[event.category]}</p>
          {/*
            The event's own words, in whichever language the host wrote them.
            See `dir="auto"` note in `PageHeader`.
          */}
          <h3 className={styles.title} dir="auto">
            {event.title}
          </h3>
          <p className={styles.summary} dir="auto">
            {event.summary}
          </p>
        </div>
      </div>

      <div className={styles.meta}>
        <EventMetaLine event={event} />
      </div>

      <div className={styles.badges}>
        <AccessBadge access={event.access} />
        <EventStatusBadge event={event} />
        {viewerStatus && <RegistrationBadge status={viewerStatus} />}
      </div>

      <div className={styles.footer}>
        <span className={styles.attendance}>
          {attendees.length > 0 && <AvatarStack users={attendees} max={4} size="xs" />}
          <span className={cx(styles.attendanceText, full && styles.full)}>
            {attendanceLabel(going, event.capacity, full)}
          </span>
        </span>
        {hostName && (
          <span className={styles.host}>{hostedByLabel(hostName)}</span>
        )}
      </div>
    </Link>
  );
}

/** Responsive grid for a page of `EventCard`s. */
export function EventGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(styles.grid, className)}>{children}</div>;
}
