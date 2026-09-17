/**
 * The translation between a SQL row and a domain object.
 *
 * One module, because the rules are small, exact, and easy to get subtly wrong
 * in three places instead of one. Nothing above `lib/data/` should ever know
 * that `uniqueidentifier` comes back uppercase or that an absent location field
 * is a NULL column -- that is this file's whole job.
 *
 * Pure. It holds no SQL, opens no connection and imports no driver, so it can
 * be read and reasoned about on its own.
 *
 * The three rules worth stating out loud, because each one is a bug if broken:
 *
 *   1. Ids are lower-cased on the way out. SQL Server returns
 *      `uniqueidentifier` as `F1AEB57F-...` while everything in the application
 *      -- fixtures, `crypto.randomUUID()`, the persona cookie -- is lower case.
 *   2. A NULL behind an optional property produces an **absent** property, not
 *      `null`. `EventLocation.venue` and `Registration.message` are declared
 *      `?: string`, and `parseLocation()` in `lib/eventInput.ts` deletes the
 *      fields a location kind does not use. `capacity` is the one exception:
 *      there `null` is the domain value, meaning unlimited.
 *   3. Timestamps become ISO strings. Every function in `lib/date.ts` takes
 *      `iso: string`, and `datetime2(3)` is exactly JavaScript's millisecond
 *      precision, so the round trip is lossless.
 */

import type {
  AccentKey,
  EventAccess,
  EventCategory,
  EventLocation,
  EventRecord,
  EventStatus,
  Registration,
  RegistrationStatus,
  User,
  UserRole,
} from "../types";

/* ------------------------------------------------------------------ the rows */

/** `dbo.Events_Users`, exactly as the driver hands it back. */
export type UserRow = {
  Id: string;
  Name: string;
  Email: string;
  Title: string;
  Role: string;
  Initials: string;
  Accent: string;
};

/** `dbo.Events_Events`. Nullable columns arrive as `null`, dates as `Date`. */
export type EventRow = {
  Id: string;
  Title: string;
  Summary: string;
  Description: string;
  StartsAt: Date;
  EndsAt: Date;
  LocationKind: string;
  LocationVenue: string | null;
  LocationAddress: string | null;
  LocationUrl: string | null;
  LocationPlatform: string | null;
  Category: string;
  Accent: string;
  Capacity: number | null;
  Access: string;
  Status: string;
  OrganizerId: string;
  CreatedAt: Date;
  UpdatedAt: Date;
};

/** `dbo.Events_Registrations`. */
export type RegistrationRow = {
  Id: string;
  EventId: string;
  UserId: string;
  Status: string;
  Message: string | null;
  CreatedAt: Date;
  UpdatedAt: Date;
  DecidedBy: string | null;
  DecidedAt: Date | null;
};

/** Either junction table: `dbo.Events_EventCoHosts`, `dbo.Events_EventInvites`. */
export type MembershipRow = { EventId: string; UserId: string };

/* ----------------------------------------------------------------- the atoms */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Is this string something the driver will accept as a `uniqueidentifier`?
 *
 * Asked before *every* id is bound, and the reason is not tidiness. `mssql`
 * rejects a malformed value with `Validation failed for parameter 'id'. Invalid
 * GUID.` rather than returning no rows, so without this a lookup that used to
 * answer "no such thing" would throw instead:
 *
 *   - `/events/garbage` would turn a 404 into a 500;
 *   - and worse, `getCurrentUser()` passes the `eb_persona` cookie straight to
 *     `db.users.get()`, so one stale or hand-edited cookie would take down
 *     every page in the application rather than falling back to the default
 *     persona.
 *
 * Callers use it to return `null` early, which is exactly what the in-memory
 * store did when its `find` matched nothing.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * An id as the domain writes it.
 *
 * SQL Server returns `uniqueidentifier` upper-cased. Lower-casing here, at the
 * single point where a row becomes a domain object, is what keeps
 * `.toLowerCase()` out of routes, pages and permission checks -- none of which
 * should know the storage engine has an opinion about case.
 */
function toId(value: string): string {
  return value.toLowerCase();
}

/** A `datetime2(3)` as the domain writes it. */
function toIso(value: Date): string {
  return value.toISOString();
}

/* --------------------------------------------------------------- the mappers */

/**
 * The enum-like columns are cast rather than re-validated.
 *
 * Each one is covered by a `CHECK` constraint created in
 * `migrations/0001_create_events_tables.sql` -- `CK_Events_Users_Role`,
 * `CK_Events_Events_Access`, `CK_Events_Registrations_Status` and the rest --
 * so the database cannot hold a value outside the union. Re-checking it in
 * TypeScript would be a second, weaker copy of a rule the schema already
 * guarantees.
 */
export function toUser(row: UserRow): User {
  return {
    id: toId(row.Id),
    name: row.Name,
    email: row.Email,
    title: row.Title,
    role: row.Role as UserRole,
    initials: row.Initials,
    accent: row.Accent as AccentKey,
  };
}

/**
 * Five flat columns back into one location.
 *
 * Each optional field is **added only when its column is not NULL**, so a
 * column that does not apply to this kind leaves no property behind at all.
 * Assigning `null` instead would not typecheck against `venue?: string`, and
 * would round-trip through the edit form as a different value.
 */
function toLocation(row: EventRow): EventLocation {
  const location: EventLocation = {
    kind: row.LocationKind as EventLocation["kind"],
  };

  if (row.LocationVenue !== null) location.venue = row.LocationVenue;
  if (row.LocationAddress !== null) location.address = row.LocationAddress;
  if (row.LocationUrl !== null) location.url = row.LocationUrl;
  if (row.LocationPlatform !== null) location.platform = row.LocationPlatform;

  return location;
}

/**
 * One event row plus the ids from its two junction tables.
 *
 * The arrays are passed in rather than fetched here: the caller has already
 * read every co-host and invite in one query and grouped them, which is what
 * keeps a list of events from becoming a list of queries.
 */
export function toEvent(
  row: EventRow,
  coHostIds: string[],
  invitedUserIds: string[],
): EventRecord {
  return {
    id: toId(row.Id),
    title: row.Title,
    summary: row.Summary,
    description: row.Description,
    startsAt: toIso(row.StartsAt),
    endsAt: toIso(row.EndsAt),
    location: toLocation(row),
    category: row.Category as EventCategory,
    accent: row.Accent as AccentKey,
    // `null` is the domain value here, not a missing one: it means unlimited.
    capacity: row.Capacity,
    access: row.Access as EventAccess,
    status: row.Status as EventStatus,
    organizerId: toId(row.OrganizerId),
    coHostIds,
    invitedUserIds,
    createdAt: toIso(row.CreatedAt),
    updatedAt: toIso(row.UpdatedAt),
  };
}

/**
 * One registration row.
 *
 * `message`, `decidedBy` and `decidedAt` follow rule 2: NULL leaves the
 * property off. That is what makes a revived registration -- one the write path
 * cleared on re-registering -- come back as a row with no message and no
 * decision, rather than one carrying three nulls.
 */
export function toRegistration(row: RegistrationRow): Registration {
  const registration: Registration = {
    id: toId(row.Id),
    eventId: toId(row.EventId),
    userId: toId(row.UserId),
    status: row.Status as RegistrationStatus,
    createdAt: toIso(row.CreatedAt),
    updatedAt: toIso(row.UpdatedAt),
  };

  if (row.Message !== null) registration.message = row.Message;
  if (row.DecidedBy !== null) registration.decidedBy = toId(row.DecidedBy);
  if (row.DecidedAt !== null) registration.decidedAt = toIso(row.DecidedAt);

  return registration;
}

/** Junction rows grouped by event, ids lower-cased, order as the query gave. */
export function groupByEvent(rows: MembershipRow[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const eventId = toId(row.EventId);
    const existing = grouped.get(eventId);
    if (existing) existing.push(toId(row.UserId));
    else grouped.set(eventId, [toId(row.UserId)]);
  }

  return grouped;
}
