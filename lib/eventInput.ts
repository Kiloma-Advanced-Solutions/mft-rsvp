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
  /**
   * The number of seats, as typed. Only meaningful when `capacityUnlimited` is
   * empty -- blank here with a limit still wanted is a mistake, not "unlimited".
   */
  capacity: string;
  /**
   * The "No limit" checkbox, as a form value: non-empty means checked.
   *
   * Form intent only, and the **only** way to reach `capacity: null`. It is
   * never persisted -- `EventContentFields` has no such field -- because what
   * the store records is the absence of a limit, not that somebody ticked a box.
   */
  capacityUnlimited: string;
  locationKind: string;
  locationVenue: string;
  locationAddress: string;
  locationUrl: string;
  locationPlatform: string;
};

/**
 * What a ticked "No limit" box submits. `"on"` is what a checkbox with no
 * explicit `value` sends, so the form and this module agree without either
 * having to special-case the other.
 */
export const UNLIMITED = "on";

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
  } else if (
    startsAt !== null &&
    // Compared as instants, not as strings. `toISOString()` is only
    // fixed-width for years 0000-9999 -- outside that range it emits an
    // expanded `+YYYYYY` year, and lexicographic order stops matching
    // chronological order. `EventRecord.endsAt` is documented as always after
    // `startsAt`, so the check has to hold for anything that parses.
    Date.parse(endsAt) <= Date.parse(startsAt)
  ) {
    errors.endsAt = EVENT_FORM_ERRORS.endsAtBeforeStart;
  }

  const category = CATEGORY_ORDER.find((option) => option === values.category);
  if (!category) errors.category = EVENT_FORM_ERRORS.categoryInvalid;

  const access = ACCESS_ORDER.find((option) => option === values.access);
  if (!access) errors.access = EVENT_FORM_ERRORS.accessInvalid;

  const capacity = parseCapacity(values.capacity, values.capacityUnlimited);
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
    // An API caller sends ISO timestamps where the form sends
    // `datetime-local` values; `parseTimestamp` accepts either, so both go
    // through `pick` unchanged.
    startsAt: pick(raw, "startsAt", base.startsAt),
    endsAt: pick(raw, "endsAt", base.endsAt),
    category: pick(raw, "category", base.category),
    access: pick(raw, "access", base.access),
    // The wire contract is unchanged: `capacity: null` (or absent on an event
    // stored without a limit) is what says "no limit". This turns that into the
    // explicit intent the form now supplies, so both callers meet the same rule.
    ...pickCapacity(raw, base),
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
    capacityUnlimited: event.capacity === null ? UNLIMITED : "",
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
  capacityUnlimited: "",
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
 * `capacity` over the wire, as the two form values the rule is written against.
 *
 * `null` is the documented "unlimited", and an omitted field falls back to
 * whatever the event already had -- so an API caller keeps the contract it has
 * always had, and neither an absent field nor an explicit `null` is mistaken
 * for a blank number box.
 */
function pickCapacity(
  raw: Record<string, unknown>,
  base: EventFormValues,
): Pick<EventFormValues, "capacity" | "capacityUnlimited"> {
  if (!("capacity" in raw)) {
    return {
      capacity: base.capacity,
      capacityUnlimited: base.capacityUnlimited,
    };
  }

  const value = raw.capacity;
  // `null` and `""` both mean "no limit" to an API caller, as before.
  if (value === null) return { capacity: "", capacityUnlimited: UNLIMITED };
  if (typeof value === "string" && value.trim() === "") {
    return { capacity: "", capacityUnlimited: UNLIMITED };
  }

  if (typeof value === "number") {
    return { capacity: String(value), capacityUnlimited: "" };
  }
  if (typeof value === "string") return { capacity: value, capacityUnlimited: "" };

  // Any other type is refused by the rule rather than crashing here.
  return { capacity: "not-a-number", capacityUnlimited: "" };
}

/**
 * Location arrives as a nested object over the wire and as flat fields from the
 * form. Flattening it here keeps one set of rules for both.
 *
 * A supplied `location` **replaces the whole object**: every sub-field is read
 * from the request, so one the caller omits is cleared rather than kept.
 * Omitting `location` entirely preserves the stored value. It is one value
 * describing one place, so a half-updated location is not a state worth
 * representing -- this is the one field where "the stored record supplies what
 * the request left out" applies to the field and not to its parts.
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
 * How many seats, or `null` for no limit.
 *
 * `null` comes only from an explicit "no limit", never from an empty field.
 * Inferring it from a blank box meant that clearing the number -- the ordinary
 * gesture before typing a new one -- silently removed an event's limit while
 * the checkbox still said the event had one.
 *
 * Anything else has to be a whole number of seats, and at least one: `0` would
 * describe an event that is permanently full.
 */
function parseCapacity(
  value: string,
  unlimited: string,
): number | null | "invalid" {
  if (unlimited !== "") return null;

  const trimmed = value.trim();
  if (trimmed === "") return "invalid";

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
