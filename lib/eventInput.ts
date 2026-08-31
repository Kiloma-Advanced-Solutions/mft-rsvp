/**
 * Turning untrusted input into a valid event.
 *
 * Shared by the create/edit form and by the route handlers that write, so the
 * two cannot disagree about what a valid event is. The form runs it to render
 * inline field errors without a round trip; the API runs it again because the
 * client's answer is not evidence. Only the API's answer decides anything.
 *
 * Deliberately importable from a Client Component: it reaches neither the store
 * nor the session, and knows nothing about HTTP. It answers "is this a
 * well-formed event", never "may this person write it" -- that question belongs
 * to `lib/permissions.ts` and stays there.
 *
 * It also decides nothing about lifecycle. `status` is not a field here: the
 * only transition M4 allows is publishing, which is its own route, so a status
 * can never arrive through this parser.
 */

import { fromDateTimeLocalValue, toDateTimeLocalValue } from "./date";
import { ACCESS_ORDER, CATEGORY_ORDER, EVENT_FORM_ERRORS } from "./labels";
import type { EventLocation, EventRecord } from "./types";

/**
 * The fields a host may set. Ownership (`organizerId`, `coHostIds`,
 * `invitedUserIds`), lifecycle (`status`), presentation (`accent`) and the
 * store's own columns are all absent -- not validated and then discarded, but
 * never read, so no request body can reach them.
 */
type EventContentFields = Pick<
  EventRecord,
  | "title"
  | "summary"
  | "description"
  | "startsAt"
  | "endsAt"
  | "location"
  | "category"
  | "capacity"
  | "access"
>;

/** Which field each message belongs to, so a form can put it in the right place. */
export type EventFieldErrors = Partial<
  Record<keyof EventContentFields | "locationVenue" | "locationUrl", string>
>;

type ParseResult =
  | { ok: true; value: EventContentFields }
  | { ok: false; errors: EventFieldErrors };

/**
 * What the form hands over. Every value is a string because that is what an
 * input produces; the empty string means "not filled in" throughout.
 *
 * `startsAt` and `endsAt` arrive in `datetime-local` form rather than as ISO
 * timestamps -- the browser is the right place to decide what "14:00" means,
 * and `fromDateTimeLocalValue` is what converts it.
 */
export type EventFormValues = {
  title: string;
  summary: string;
  description: string;
  /** `<input type="datetime-local">` value, e.g. "2026-09-14T14:00". */
  startsAt: string;
  endsAt: string;
  category: string;
  access: string;
  /** Empty string means unlimited, which becomes `capacity: null`. */
  capacity: string;
  locationKind: string;
  locationVenue: string;
  locationAddress: string;
  locationUrl: string;
  locationPlatform: string;
};

const LOCATION_KINDS: EventLocation["kind"][] = [
  "in_person",
  "online",
  "hybrid",
];

/**
 * Every rule in one pass, collecting all the errors rather than stopping at the
 * first -- a form that reveals one problem per submit is miserable to fill in.
 *
 * The rules come from the contracts documented in `lib/types.ts`, and nothing
 * else. In particular there is no length limit on `summary`: its "keep it under
 * ~110 characters" note is guidance for whoever writes one, and the card
 * already line-clamps a long one, so refusing it here would be a domain rule
 * the product does not have.
 */
export function parseEventForm(values: EventFormValues): ParseResult {
  const errors: EventFieldErrors = {};

  const title = values.title.trim();
  if (title === "") errors.title = EVENT_FORM_ERRORS.titleRequired;

  const summary = values.summary.trim();
  if (summary === "") errors.summary = EVENT_FORM_ERRORS.summaryRequired;

  const description = values.description.trim();
  if (description === "") {
    errors.description = EVENT_FORM_ERRORS.descriptionRequired;
  }

  const startsAt = parseTimestamp(values.startsAt);
  if (startsAt === null) errors.startsAt = EVENT_FORM_ERRORS.startsAtInvalid;

  const endsAt = parseTimestamp(values.endsAt);
  if (endsAt === null) {
    errors.endsAt = EVENT_FORM_ERRORS.endsAtInvalid;
  } else if (startsAt !== null && endsAt <= startsAt) {
    // `EventRecord.endsAt` is documented as always after `startsAt`.
    errors.endsAt = EVENT_FORM_ERRORS.endsAtBeforeStart;
  }

  const category = CATEGORY_ORDER.find((option) => option === values.category);
  if (!category) errors.category = EVENT_FORM_ERRORS.categoryInvalid;

  const access = ACCESS_ORDER.find((option) => option === values.access);
  if (!access) errors.access = EVENT_FORM_ERRORS.accessInvalid;

  const capacity = parseCapacity(values.capacity);
  if (capacity === "invalid") errors.capacity = EVENT_FORM_ERRORS.capacityInvalid;

  const location = parseLocation(values, errors);

  if (
    title === "" ||
    summary === "" ||
    description === "" ||
    startsAt === null ||
    endsAt === null ||
    !category ||
    !access ||
    capacity === "invalid" ||
    location === null ||
    Object.keys(errors).length > 0
  ) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title,
      summary,
      description,
      startsAt,
      endsAt,
      location,
      category,
      capacity,
      access,
    },
  };
}

/**
 * The same rules applied to a JSON body, which is what a route handler gets.
 *
 * It normalises the body into `EventFormValues` first, so there is exactly one
 * implementation of every rule rather than a form copy and an API copy. A
 * missing or wrongly typed field becomes the empty string and is then refused
 * by the rule that covers it -- so `{ "capacity": {} }` is a validation error
 * and never a crash.
 *
 * `fallback` supplies the current values when a `PATCH` omits a field, which is
 * what lets a request that sends only `endsAt` still be checked against the
 * stored `startsAt`.
 */
export function parseEventBody(
  body: unknown,
  fallback?: EventContentFields,
): ParseResult {
  const raw: Record<string, unknown> =
    typeof body === "object" && body !== null
      ? (body as Record<string, unknown>)
      : {};

  const base = fallback ? toFallbackValues(fallback) : EMPTY_FORM_VALUES;

  return parseEventForm({
    title: pick(raw, "title", base.title),
    summary: pick(raw, "summary", base.summary),
    description: pick(raw, "description", base.description),
    startsAt: pickTimestamp(raw, "startsAt", base.startsAt),
    endsAt: pickTimestamp(raw, "endsAt", base.endsAt),
    category: pick(raw, "category", base.category),
    access: pick(raw, "access", base.access),
    capacity: pickCapacity(raw, base.capacity),
    ...pickLocation(raw, base),
  });
}

/**
 * The stored event as the form wants it: timestamps in `datetime-local` form,
 * everything else a plain string.
 *
 * Call this **on the server** and pass the result to the form as a prop. The
 * conversion reads the local clock, so recomputing it during a client render
 * could disagree with what the server produced -- which is the hydration
 * mismatch `lib/date.ts` warns about.
 */
export function toFormValues(event: EventContentFields): EventFormValues {
  return {
    ...toFallbackValues(event),
    startsAt: toDateTimeLocalValue(event.startsAt),
    endsAt: toDateTimeLocalValue(event.endsAt),
  };
}

/**
 * The same fields with the timestamps left as stored ISO strings, which is what
 * a `PATCH` needs when it has to fill in whatever the request left out.
 */
function toFallbackValues(event: EventContentFields): EventFormValues {
  return {
    title: event.title,
    summary: event.summary,
    description: event.description,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    category: event.category,
    access: event.access,
    capacity: event.capacity === null ? "" : String(event.capacity),
    locationKind: event.location.kind,
    locationVenue: event.location.venue ?? "",
    locationAddress: event.location.address ?? "",
    locationUrl: event.location.url ?? "",
    locationPlatform: event.location.platform ?? "",
  };
}

const EMPTY_FORM_VALUES: EventFormValues = {
  title: "",
  summary: "",
  description: "",
  startsAt: "",
  endsAt: "",
  category: "",
  access: "",
  capacity: "",
  locationKind: "",
  locationVenue: "",
  locationAddress: "",
  locationUrl: "",
  locationPlatform: "",
};

function pick(
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  if (!(key in raw)) return fallback;
  return typeof raw[key] === "string" ? (raw[key] as string) : "";
}

/**
 * An API caller sends ISO timestamps, not `datetime-local` values, so an
 * absent field falls back to the stored ISO string and a present one is passed
 * through for `parseTimestamp` to judge.
 */
function pickTimestamp(
  raw: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  if (!(key in raw)) return fallback;
  return typeof raw[key] === "string" ? (raw[key] as string) : "";
}

/** `null` is the documented "unlimited", which the form spells as "". */
function pickCapacity(
  raw: Record<string, unknown>,
  fallback: string,
): string {
  if (!("capacity" in raw)) return fallback;
  const value = raw.capacity;
  if (value === null) return "";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return value;
  return "not-a-number";
}

/**
 * Location arrives as a nested object over the wire and as flat fields from the
 * form. Flattening it here keeps one set of rules for both.
 */
function pickLocation(
  raw: Record<string, unknown>,
  base: EventFormValues,
): Pick<
  EventFormValues,
  | "locationKind"
  | "locationVenue"
  | "locationAddress"
  | "locationUrl"
  | "locationPlatform"
> {
  if (!("location" in raw)) {
    return {
      locationKind: base.locationKind,
      locationVenue: base.locationVenue,
      locationAddress: base.locationAddress,
      locationUrl: base.locationUrl,
      locationPlatform: base.locationPlatform,
    };
  }

  const location: Record<string, unknown> =
    typeof raw.location === "object" && raw.location !== null
      ? (raw.location as Record<string, unknown>)
      : {};

  return {
    locationKind: pick(location, "kind", ""),
    locationVenue: pick(location, "venue", ""),
    locationAddress: pick(location, "address", ""),
    locationUrl: pick(location, "url", ""),
    locationPlatform: pick(location, "platform", ""),
  };
}

/**
 * Accepts both an ISO timestamp and a `datetime-local` value, because the API
 * gets the first and the form produces the second. Returns a full ISO string,
 * or `null` when the value is not a date at all.
 */
function parseTimestamp(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const time = new Date(trimmed).getTime();
  if (Number.isNaN(time)) return null;

  // A `datetime-local` value carries no zone, so it has to be read as local
  // time; an ISO string already has one and survives the round trip.
  return fromDateTimeLocalValue(trimmed);
}

/**
 * `""` is unlimited. Anything else has to be a whole number of seats, and at
 * least one -- `0` would mean an event that is permanently full.
 */
function parseCapacity(value: string): number | null | "invalid" {
  const trimmed = value.trim();
  if (trimmed === "") return null;

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) return "invalid";
  return parsed;
}

/**
 * `EventLocation.kind` decides which of the optional fields are meaningful, so
 * the ones that are not are dropped rather than carried: switching a hybrid
 * event to online must not leave its old street address behind.
 */
function parseLocation(
  values: EventFormValues,
  errors: EventFieldErrors,
): EventLocation | null {
  const kind = LOCATION_KINDS.find((option) => option === values.locationKind);
  if (!kind) {
    errors.location = EVENT_FORM_ERRORS.locationKindInvalid;
    return null;
  }

  const venue = values.locationVenue.trim();
  const address = values.locationAddress.trim();
  const url = values.locationUrl.trim();
  const platform = values.locationPlatform.trim();

  const needsVenue = kind === "in_person" || kind === "hybrid";
  const needsUrl = kind === "online" || kind === "hybrid";

  if (needsVenue && venue === "") {
    errors.locationVenue = EVENT_FORM_ERRORS.venueRequired;
  }
  if (needsUrl && url === "") {
    errors.locationUrl = EVENT_FORM_ERRORS.urlRequired;
  }
  if (errors.locationVenue || errors.locationUrl) return null;

  const location: EventLocation = { kind };
  if (needsVenue) {
    location.venue = venue;
    if (address !== "") location.address = address;
  }
  if (needsUrl) {
    location.url = url;
    if (platform !== "") location.platform = platform;
  }

  return location;
}
