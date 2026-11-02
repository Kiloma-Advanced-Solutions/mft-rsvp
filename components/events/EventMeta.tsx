import { Badge, Icon } from "@/components/ui";
import type { IconName } from "@/components/ui";
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
  CAPACITY_LABELS,
  EVENT_STATUS_LABELS,
  EVENT_STATUS_TONES,
  LOCATION_KIND_LABELS,
  REGISTRATION_LABELS,
  REGISTRATION_TONES,
  capacityCountLabel,
  goingCountLabel,
  locationLabel,
  placesLeftLabel,
} from "@/lib/labels";
import type {
  EventAccess,
  EventCategory,
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

/**
 * The class that sets `--category-bg`, `--category-fg` and `--category-dot` to
 * a category's tone, for anything inside it that is tinted by category. The
 * category-to-tone mapping itself is in `app/styles/tokens.css`.
 */
export function categoryToneClass(category: EventCategory): string {
  return styles[category];
}

/** Calendar-tile date, e.g. AUG / 24 / Sat, tinted by the event's category. */
export function DateBlock({
  iso,
  category,
  size = "md",
  cancelled = false,
  className,
}: {
  iso: string;
  /** Tints the tile. Without one it takes the neutral tone. */
  category?: EventCategory;
  size?: "md" | "lg";
  /**
   * Strikes the date through: the event is not going to happen on it. The
   * tile takes the cancelled tone instead of the category's.
   */
  cancelled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(
        styles.dateBlock,
        category && styles[category],
        size === "lg" && styles.dateBlockLg,
        cancelled && styles.dateBlockCancelled,
        className,
      )}
    >
      <span className={styles.dateBlockMonth}>{formatMonthShort(iso)}</span>
      <span className={styles.dateBlockDay}>{formatDayNumber(iso)}</span>
      <span className={styles.dateBlockWeekday}>{formatWeekdayShort(iso)}</span>
    </div>
  );
}

/** Each access mode's icon, on its chip and in the board's access filter. */
export const ACCESS_ICONS: Record<EventAccess, IconName> = {
  open: "globe",
  approval: "userCheck",
  invite: "lock",
};

/**
 * How people get in: Open / Approval needed / Invite only. A neutral chip with
 * an icon rather than a coloured pill -- colour is kept for states (the
 * viewer's registration, draft, cancelled, past), and access is not one.
 */
export function AccessBadge({
  access,
  size = "sm",
}: {
  access: EventAccess;
  size?: "sm" | "lg";
}) {
  return (
    <Badge variant="outline" size={size}>
      <Icon
        name={ACCESS_ICONS[access]}
        size={size === "lg" ? "sm" : "xs"}
        className={styles.accessIcon}
      />
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
        {CAPACITY_LABELS.past}
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
        <Icon name="clock" size="sm" />
        <span className={styles.metaText}>
          {formatTimeRange(event.startsAt, event.endsAt)}
        </span>
      </span>
      <span className={styles.metaItem}>
        <Icon name="pin" size="sm" />
        <span className={styles.metaText} dir="auto">
          {locationLabel(event.location)}
        </span>
      </span>
    </div>
  );
}

/**
 * Expanded when/where/duration block for the detail page. A cancelled event's
 * date is struck through, the same as its date block on the board.
 */
export function EventMetaDetails({
  event,
  className,
}: {
  event: Pick<EventRecord, "startsAt" | "endsAt" | "location" | "status">;
  className?: string;
}) {
  return (
    <div className={cx(styles.metaStack, className)}>
      <div className={styles.metaItem}>
        <span className={styles.metaIcon} aria-hidden>
          ◷
        </span>
        <span className={styles.metaText}>
          <span
            className={event.status === "cancelled" ? styles.struck : undefined}
          >
            {formatDateLong(event.startsAt)}
          </span>
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

  /*
    `dir="auto"` goes on each line rather than on the wrapper. On the wrapper it
    also sets the wrapper's `direction`, so a Latin venue turned the whole block
    LTR and both lines aligned away from the icon. Per line, each still picks its
    own direction while the block stays in the document's.
  */
  return (
    <span className={styles.metaText}>
      <span dir="auto">
        {showsVenue ? (location.venue ?? LOCATION_KIND_LABELS[location.kind]) : null}
        {showsVenue && showsLink ? " · " : null}
        {showsLink && location.url ? (
          <a
            className={styles.metaLink}
            href={location.url}
            target="_blank"
            rel="noreferrer"
          >
            {location.platform ?? CAPACITY_LABELS.joinLink}
          </a>
        ) : null}
      </span>
      {location.address && (
        <span className={styles.metaSub} dir="auto">
          {location.address}
        </span>
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
          <span className={styles.capacityCount}>
            {goingCountLabel(going)}
          </span>
          <span className={styles.capacityRemaining}>
            {CAPACITY_LABELS.noLimit}
          </span>
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
          {capacityCountLabel(going, capacity)}
        </span>
        <span className={cx(styles.capacityRemaining, full && styles.capacityFull)}>
          {full ? CAPACITY_LABELS.full : placesLeftLabel(capacity - going)}
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
