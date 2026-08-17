import { Badge } from "@/components/ui";
import { cx } from "@/lib/cx";
import {
  formatDateLong,
  formatDayNumber,
  formatDuration,
  formatMonthShort,
  formatRelativeDay,
  formatTimeRange,
  formatWeekdayShort,
  isPast,
} from "@/lib/date";
import {
  ACCESS_LABELS,
  ACCESS_TONES,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_TONES,
  LOCATION_KIND_LABELS,
  REGISTRATION_LABELS,
  REGISTRATION_TONES,
  locationLabel,
} from "@/lib/labels";
import type {
  EventAccess,
  EventLocation,
  EventRecord,
  RegistrationStatus,
} from "@/lib/types";

import styles from "./EventMeta.module.css";

/**
 * The small pieces of event chrome that show up on more than one screen.
 *
 * Reuse these rather than re-deriving "is this event full" or picking a badge
 * colour by hand — consistency between the board and the detail page is most of
 * what makes the app feel finished.
 */

/** Calendar-tile date, e.g. AUG / 24 / Sat. */
export function DateBlock({
  iso,
  accent,
  size = "md",
  className,
}: {
  iso: string;
  /** Tints the month. Defaults to the brand colour. */
  accent?: EventRecord["accent"];
  size?: "md" | "lg";
  className?: string;
}) {
  return (
    <div
      className={cx(styles.dateBlock, size === "lg" && styles.dateBlockLg, className)}
      style={accent ? { ["--accent-color" as string]: `var(--accent-${accent})` } : undefined}
    >
      <span className={styles.dateBlockMonth}>{formatMonthShort(iso)}</span>
      <span className={styles.dateBlockDay}>{formatDayNumber(iso)}</span>
      <span className={styles.dateBlockWeekday}>{formatWeekdayShort(iso)}</span>
    </div>
  );
}

/** How people get in: Open / Approval needed / Invite only. */
export function AccessBadge({
  access,
  size = "sm",
}: {
  access: EventAccess;
  size?: "sm" | "lg";
}) {
  return (
    <Badge tone={ACCESS_TONES[access]} size={size}>
      {ACCESS_LABELS[access]}
    </Badge>
  );
}

/**
 * Lifecycle badge. Renders nothing for a normal published upcoming event —
 * that is the default state and does not need calling out.
 */
export function EventStatusBadge({
  event,
  size = "sm",
}: {
  event: Pick<EventRecord, "status" | "startsAt">;
  size?: "sm" | "lg";
}) {
  if (event.status !== "published") {
    return (
      <Badge tone={EVENT_STATUS_TONES[event.status]} size={size} dot>
        {EVENT_STATUS_LABELS[event.status]}
      </Badge>
    );
  }

  if (isPast(event.startsAt)) {
    return (
      <Badge tone="neutral" size={size}>
        Past
      </Badge>
    );
  }

  return null;
}

/** Where the viewer stands with this event. */
export function RegistrationBadge({
  status,
  size = "sm",
}: {
  status: RegistrationStatus;
  size?: "sm" | "lg";
}) {
  return (
    <Badge tone={REGISTRATION_TONES[status]} variant="soft" size={size} dot>
      {REGISTRATION_LABELS[status]}
    </Badge>
  );
}

/** Compact "when + where" line for cards. */
export function EventMetaLine({
  event,
  className,
}: {
  event: Pick<EventRecord, "startsAt" | "endsAt" | "location">;
  className?: string;
}) {
  return (
    <div className={cx(styles.metaList, className)}>
      <span className={styles.metaItem}>
        <span className={styles.metaIcon} aria-hidden>
          ◷
        </span>
        <span className={styles.metaText}>
          {formatTimeRange(event.startsAt, event.endsAt)}
        </span>
      </span>
      <span className={styles.metaItem}>
        <span className={styles.metaIcon} aria-hidden>
          ⌖
        </span>
        <span className={styles.metaText}>{locationLabel(event.location)}</span>
      </span>
    </div>
  );
}

/** Expanded when/where/duration block for the detail page. */
export function EventMetaDetails({
  event,
  className,
}: {
  event: Pick<EventRecord, "startsAt" | "endsAt" | "location">;
  className?: string;
}) {
  return (
    <div className={cx(styles.metaStack, className)}>
      <div className={styles.metaItem}>
        <span className={styles.metaIcon} aria-hidden>
          ◷
        </span>
        <span className={styles.metaText}>
          {formatDateLong(event.startsAt)}
          <span className={styles.metaSub}>
            {formatTimeRange(event.startsAt, event.endsAt)} ·{" "}
            {formatDuration(event.startsAt, event.endsAt)} ·{" "}
            {formatRelativeDay(event.startsAt)}
          </span>
        </span>
      </div>

      <div className={styles.metaItem}>
        <span className={styles.metaIcon} aria-hidden>
          ⌖
        </span>
        <LocationDetails location={event.location} />
      </div>
    </div>
  );
}

function LocationDetails({ location }: { location: EventLocation }) {
  const showsVenue = location.kind !== "online";
  const showsLink = location.kind !== "in_person";

  return (
    <span className={styles.metaText}>
      {showsVenue ? (location.venue ?? LOCATION_KIND_LABELS[location.kind]) : null}
      {showsVenue && showsLink ? " · " : null}
      {showsLink && location.url ? (
        <a
          className={styles.metaLink}
          href={location.url}
          target="_blank"
          rel="noreferrer"
        >
          {location.platform ?? "Join link"}
        </a>
      ) : null}
      {location.address && (
        <span className={styles.metaSub}>{location.address}</span>
      )}
    </span>
  );
}

/**
 * Attendance against capacity. `capacity: null` means unlimited, in which case
 * there is no bar to draw — just the headcount.
 */
export function CapacityMeter({
  going,
  capacity,
  className,
}: {
  going: number;
  capacity: number | null;
  className?: string;
}) {
  if (capacity === null) {
    return (
      <div className={cx(styles.capacity, className)}>
        <div className={styles.capacityRow}>
          <span className={styles.capacityCount}>{going} going</span>
          <span className={styles.capacityRemaining}>No limit</span>
        </div>
      </div>
    );
  }

  const full = going >= capacity;
  const percent = Math.min(100, Math.round((going / capacity) * 100));

  return (
    <div className={cx(styles.capacity, className)}>
      <div className={styles.capacityRow}>
        <span className={styles.capacityCount}>
          {going} / {capacity} going
        </span>
        <span className={cx(styles.capacityRemaining, full && styles.capacityFull)}>
          {full ? "Full" : `${capacity - going} left`}
        </span>
      </div>
      <div className={styles.capacityTrack}>
        <div
          className={styles.capacityFill}
          data-full={full}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
