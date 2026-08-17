/**
 * Reading events for a viewer. SERVER ONLY.
 *
 * Everything a screen needs about an event that is not on the record itself —
 * its hosts, how many people are going, where the viewer stands — is derived
 * here once, rather than in each screen that happens to need it.
 *
 * This is the seam a real database goes behind. `lib/db.ts` is the only module
 * that touches storage, so swapping it for Postgres changes that file and
 * leaves every caller of this one alone. Never import this from a Client
 * Component — client code goes through an API route.
 */

import type { BoardFilters } from "./board-filters";
import { isPast } from "./date";
import { db } from "./db";
import { canManageEvent, canViewEvent } from "./permissions";
import type {
  EventAccess,
  EventRecord,
  EventWithContext,
  Registration,
  User,
} from "./types";

/** An `EventWithContext` plus the faces the card puts in its avatar stack. */
export type BoardEvent = EventWithContext & {
  /** Confirmed attendees only. */
  attendees: User[];
};

export type Board = {
  /** Soonest first. */
  upcoming: BoardEvent[];
  /** Most recent first. */
  past: BoardEvent[];
  /** Everything this person may see, before any filter is applied. */
  visibleCount: number;
  /** Matches per access mode within the chosen category, for the filter bar. */
  accessCounts: Record<EventAccess, number>;
};

/**
 * The board, as this person is allowed to see it.
 *
 * The visibility rule runs here, over the whole store, before anything is
 * counted or rendered. What it rejects never leaves the server — an invite-only
 * event is absent from the result, not hidden in the markup.
 */
export async function getBoard(
  viewer: User,
  filters: BoardFilters,
): Promise<Board> {
  const [events, registrations, users] = await Promise.all([
    db.events.list(),
    db.registrations.list(),
    db.users.list(),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));

  const visible = events
    .filter((event) => canViewEvent(event, viewer))
    .map((event) => toBoardEvent(event, viewer, registrations, usersById));

  // Category first, so the access counts below describe the category in view
  // rather than the whole board — clicking a mode then always shows what the
  // number promised.
  const inCategory = filters.category
    ? visible.filter((row) => row.event.category === filters.category)
    : visible;

  const matches = filters.access
    ? inCategory.filter((row) => row.event.access === filters.access)
    : inCategory;

  return {
    ...splitByTime(matches),
    visibleCount: visible.length,
    accessCounts: countByAccess(inCategory),
  };
}

function toBoardEvent(
  event: EventRecord,
  viewer: User,
  registrations: Registration[],
  usersById: Map<string, User>,
): BoardEvent {
  const rows = registrations.filter((row) => row.eventId === event.id);
  const going = rows.filter((row) => row.status === "going");

  const lookup = (id: string) => usersById.get(id);
  const found = (user: User | undefined): user is User => user !== undefined;

  return {
    event,
    hosts: [event.organizerId, ...event.coHostIds].map(lookup).filter(found),
    // Only `going` counts against capacity. `pending`, `cancelled`, `rejected`
    // and `waitlisted` do not — section 4 of TASKS.md.
    goingCount: going.length,
    pendingCount: rows.filter((row) => row.status === "pending").length,
    viewerRegistration: rows.find((row) => row.userId === viewer.id) ?? null,
    viewerCanManage: canManageEvent(event, viewer),
    attendees: going.map((row) => lookup(row.userId)).filter(found),
  };
}

/**
 * An event moves to "past" once it has started, which is the same line
 * `EventCard` uses to dim itself and the same one that closes registration.
 *
 * This reads the clock, which is safe because it only ever runs on the server.
 * Doing the same split during a client render would drift from what the server
 * sent and show up as a hydration mismatch.
 */
function splitByTime(events: BoardEvent[]): {
  upcoming: BoardEvent[];
  past: BoardEvent[];
} {
  const upcoming: BoardEvent[] = [];
  const past: BoardEvent[] = [];

  for (const row of events) {
    (isPast(row.event.startsAt) ? past : upcoming).push(row);
  }

  const byStart = (a: BoardEvent, b: BoardEvent) =>
    Date.parse(a.event.startsAt) - Date.parse(b.event.startsAt);

  upcoming.sort(byStart);
  past.sort((a, b) => byStart(b, a));

  return { upcoming, past };
}

function countByAccess(events: BoardEvent[]): Record<EventAccess, number> {
  const counts: Record<EventAccess, number> = {
    open: 0,
    approval: 0,
    invite: 0,
  };

  for (const row of events) counts[row.event.access] += 1;
  return counts;
}
