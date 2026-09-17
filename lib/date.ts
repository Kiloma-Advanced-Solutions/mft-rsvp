/**
 * Date formatting.
 *
 * Locale is pinned to `he-IL` on purpose. Formatting with the ambient locale
 * makes the server and the browser disagree, which shows up as a React
 * hydration warning that is genuinely annoying to track down -- so this stays a
 * literal, and the fact that it is now the same language as the UI does not
 * make reading it off the request any safer.
 *
 * `he-IL` resolves to Latin digits, so a date still looks like "24" and the
 * calendar tile keeps its design.
 *
 * The `relative*` helpers read the clock, so they belong in Server Components
 * or in an effect. Calling them during a client render can also drift from what
 * the server produced.
 */

import { hebrewAnd } from "./labels";

const LOCALE = "he-IL";

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

/** "אוג׳" */
export function formatMonthShort(iso: string): string {
  return monthShort.format(new Date(iso));
}

/** "יום ב׳" */
export function formatWeekdayShort(iso: string): string {
  return weekdayShort.format(new Date(iso));
}

/** "יום שני, 24 באוגוסט" */
export function formatDateLong(iso: string): string {
  return dateLong.format(new Date(iso));
}

/** "24 באוגוסט 2026" */
export function formatDateWithYear(iso: string): string {
  return dateWithYear.format(new Date(iso));
}

/** "14:00" */
export function formatTime(iso: string): string {
  return timeOnly.format(new Date(iso));
}

/** "14:00 – 15:30" */
export function formatTimeRange(startIso: string, endIso: string): string {
  /*
    Isolated left-to-right. The two times are digits either side of a neutral
    dash, and in an RTL paragraph the bidi algorithm resolves that dash to the
    paragraph direction and renders the range end-first -- "15:30 – 14:00".
    U+2066/U+2069 pin the run to LTR without affecting anything around it, which
    is what these characters are for; the alternative is a `dir` attribute at
    every one of the call sites.
  */
  return `\u2066${formatTime(startIso)} – ${formatTime(endIso)}\u2069`;
}

/** "שעה ו-30 דקות", "45 דקות", "3 שעות" */
export function formatDuration(startIso: string, endIso: string): string {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (ms <= 0) return "—";

  const hours = Math.floor(ms / HOUR_MS);
  const minutes = Math.round((ms % HOUR_MS) / MINUTE_MS);

  if (hours === 0) return minuteCount(minutes);
  if (minutes === 0) return hourCount(hours);
  return `${hourCount(hours)} ${hebrewAnd(minuteCount(minutes))}`;
}

/**
 * Hebrew counts one and two differently from everything above them -- two is a
 * dual form, not a numeral -- so a count cannot be pasted in front of a noun
 * the way `${n}h` can. Every counted phrase below goes through one of these.
 */
function hourCount(n: number): string {
  if (n === 1) return "שעה";
  if (n === 2) return "שעתיים";
  return `${n} שעות`;
}

function minuteCount(n: number): string {
  if (n === 1) return "דקה";
  if (n === 2) return "שתי דקות";
  return `${n} דקות`;
}

function dayCount(n: number): string {
  if (n === 1) return "יום";
  if (n === 2) return "יומיים";
  return `${n} ימים`;
}

function weekCount(n: number): string {
  if (n === 1) return "שבוע";
  if (n === 2) return "שבועיים";
  return `${n} שבועות`;
}

function monthCount(n: number): string {
  if (n === 1) return "חודש";
  if (n === 2) return "חודשיים";
  return `${n} חודשים`;
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

/** "היום", "מחר", "בעוד 4 ימים", "לפני 3 ימים", "בעוד 3 שבועות". */
export function formatRelativeDay(iso: string): string {
  const days = daysUntil(iso);

  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  if (days === -1) return "אתמול";

  // Same buckets as before; only the wording is Hebrew.
  if (days > 0) {
    if (days < 7) return `בעוד ${dayCount(days)}`;
    if (days < 14) return "בשבוע הבא";
    if (days < 31) return `בעוד ${weekCount(Math.round(days / 7))}`;
    return `בעוד ${monthCount(Math.round(days / 30))}`;
  }

  const ago = Math.abs(days);
  if (ago < 7) return `לפני ${dayCount(ago)}`;
  if (ago < 14) return "בשבוע שעבר";
  if (ago < 31) return `לפני ${weekCount(Math.round(ago / 7))}`;
  return `לפני ${monthCount(Math.round(ago / 30))}`;
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
