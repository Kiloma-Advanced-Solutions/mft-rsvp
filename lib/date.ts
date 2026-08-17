/**
 * Date formatting.
 *
 * Locale is pinned to `en-GB` on purpose. Formatting with the ambient locale
 * makes the server and the browser disagree, which shows up as a React
 * hydration warning that is genuinely annoying to track down.
 *
 * The `relative*` helpers read the clock, so they belong in Server Components
 * or in an effect. Calling them during a client render can also drift from what
 * the server produced.
 */

const LOCALE = "en-GB";

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const dayNumber = new Intl.DateTimeFormat(LOCALE, { day: "numeric" });
const monthShort = new Intl.DateTimeFormat(LOCALE, { month: "short" });
const weekdayShort = new Intl.DateTimeFormat(LOCALE, { weekday: "short" });
const dateLong = new Intl.DateTimeFormat(LOCALE, {
  weekday: "long",
  day: "numeric",
  month: "long",
});
const dateWithYear = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
});
const timeOnly = new Intl.DateTimeFormat(LOCALE, {
  hour: "2-digit",
  minute: "2-digit",
});

/** "24" — the big number on a date block. */
export function formatDayNumber(iso: string): string {
  return dayNumber.format(new Date(iso));
}

/** "Aug" */
export function formatMonthShort(iso: string): string {
  return monthShort.format(new Date(iso));
}

/** "Sat" */
export function formatWeekdayShort(iso: string): string {
  return weekdayShort.format(new Date(iso));
}

/** "Saturday, 24 August" */
export function formatDateLong(iso: string): string {
  return dateLong.format(new Date(iso));
}

/** "24 August 2026" */
export function formatDateWithYear(iso: string): string {
  return dateWithYear.format(new Date(iso));
}

/** "14:00" */
export function formatTime(iso: string): string {
  return timeOnly.format(new Date(iso));
}

/** "14:00 – 15:30" */
export function formatTimeRange(startIso: string, endIso: string): string {
  return `${formatTime(startIso)} – ${formatTime(endIso)}`;
}

/** "1h 30m", "45m", "3h" */
export function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 0) return "—";

  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.round((ms % HOUR_MS) / MINUTE_MS);

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

export function isPast(iso: string): boolean {
  return new Date(iso).getTime() < Date.now();
}

/** Whole calendar days between today and the given date. Negative is the past. */
export function daysUntil(iso: string): number {
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

/** "Today", "Tomorrow", "In 4 days", "3 days ago", "In 3 weeks". */
export function formatRelativeDay(iso: string): string {
  const days = daysUntil(iso);

  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  if (days === -1) return "Yesterday";

  if (days > 0) {
    if (days < 7) return `In ${days} days`;
    if (days < 14) return "Next week";
    if (days < 31) return `In ${Math.round(days / 7)} weeks`;
    return `In ${Math.round(days / 30)} months`;
  }

  const ago = Math.abs(days);
  if (ago < 7) return `${ago} days ago`;
  if (ago < 14) return "Last week";
  if (ago < 31) return `${Math.round(ago / 7)} weeks ago`;
  return `${Math.round(ago / 30)} months ago`;
}

/**
 * Key for grouping events into calendar days: "2026-08-24" in local time.
 * `toISOString()` would be wrong here — it shifts into UTC and can move an
 * evening event to the next day.
 */
export function toDayKey(iso: string): string {
  const date = new Date(iso);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** ISO string trimmed to what `<input type="datetime-local">` expects. */
export function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** The inverse: a `datetime-local` value back to a full ISO timestamp. */
export function fromDateTimeLocalValue(value: string): string {
  return new Date(value).toISOString();
}
