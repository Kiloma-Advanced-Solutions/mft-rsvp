/**
 * Derived event data for the screens. SERVER ONLY.
 *
 * `EventWithContext` in `lib/types.ts` is the shape every event screen wants:
 * the event plus its hosts, the counts, the viewer's own registration and
 * whether they may manage it. This module is what builds one.
 *
 * Visibility is applied here, before any context is derived, so an event the
 * viewer may not see never reaches a page or a payload at all. The rules come
 * from `lib/permissions.ts`; this file only decides what to load.
 *
 * The three collections are read once and indexed in memory rather than queried
 * per event. The store is async precisely so it can be swapped for a real
 * database later, and a per-event lookup is the thing that becomes N+1 the day
 * it is.
 *
 * Never import this from a Client Component — it reaches the store.
 */

import { db } from "./db";
import {
  canManageEvent,
  canViewEvent,
  getRequestDecisionAvailability,
} from "./permissions";
import type {
  EventDetailContext,
  EventRecord,
  EventRequest,
  EventWithContext,
  Registration,
  User,
} from "./types";

/**
 * Every event `viewer` is allowed to see, each with its board context.
 *
 * Returned in store order; ordering for display is the caller's decision.
 */
export async function getVisibleEventsWithContext(
  viewer: User,
): Promise<EventWithContext[]> {
  const [events, users, registrations] = await Promise.all([
    db.events.list(),
    db.users.list(),
    db.registrations.list(),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));
  const registrationsByEvent = new Map<string, Registration[]>();
  for (const registration of registrations) {
    const rows = registrationsByEvent.get(registration.eventId);
    if (rows) {
      rows.push(registration);
    } else {
      registrationsByEvent.set(registration.eventId, [registration]);
    }
  }

  return events
    .filter((event) => canViewEvent(event, viewer))
    .map((event) =>
      toEventContext(
        event,
        registrationsByEvent.get(event.id) ?? [],
        usersById,
        viewer,
      ),
    );
}

/**
 * One event the `viewer` is allowed to see, with the extra detail the event
 * screen needs, or `null`.
 *
 * `null` means both "no such event" and "not yours", and the caller cannot tell
 * which. That is deliberate: `TASKS.md` section 4 requires a 404 rather than a
 * 403, because a 403 confirms the event exists. Visibility is decided here,
 * before any context is derived, so an invisible event never has its hosts,
 * counts or attendees loaded at all.
 *
 * It returns `null` rather than calling `notFound()` itself so a route handler
 * can turn the same answer into an `ApiError` instead of a rendered page.
 */
export async function getEventDetailForViewer(
  eventId: string,
  viewer: User,
): Promise<EventDetailContext | null> {
  const event = await db.events.get(eventId);
  if (!event || !canViewEvent(event, viewer)) return null;

  const [users, rows] = await Promise.all([
    db.users.list(),
    db.registrations.list({ eventId }),
  ]);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const context = toEventContext(event, rows, usersById, viewer);

  return {
    ...context,
    // Registration order, and a row whose user has since disappeared is
    // dropped rather than left as a hole — the same treatment as a stale host.
    attendees: rows
      .filter((row) => row.status === "going")
      .map((row) => usersById.get(row.userId))
      .filter((user): user is User => user !== undefined),
    // Who asked and what they wrote is host-only, so it is not assembled at all
    // for anyone else. Gating the render would be enough for the page, but this
    // way a future caller that forgets to gate has nothing to leak.
    requests: context.viewerCanManage
      ? toRequests(event, rows, usersById, context.goingCount)
      : [],
  };
}

/**
 * The `pending` and `rejected` rows a host may act on, in registration order.
 *
 * `requesterCanView` is answered per row because a request outlives the access
 * change that hid its event: switching to `invite` keeps every registration and
 * removes visibility for anyone off the list. The queue surfaces that rather
 * than dropping the row, which would leave `pendingCount` describing requests
 * the host cannot see.
 *
 * A row whose person has since disappeared is dropped, the same treatment
 * `attendees` and `hosts` give a stale id.
 */
function toRequests(
  event: EventRecord,
  rows: Registration[],
  usersById: Map<string, User>,
  goingCount: number,
): EventRequest[] {
  return rows
    .filter((row) => row.status === "pending" || row.status === "rejected")
    .map((registration) => {
      const requester = usersById.get(registration.userId);
      if (!requester) return null;

      return {
        registration,
        requester,
        requesterCanView: canViewEvent(event, requester),
        decision: getRequestDecisionAvailability(event, {
          goingCount,
          registration,
        }),
      };
    })
    .filter((request): request is EventRequest => request !== null);
}

/**
 * The shared part of every event context. Both callers go through it so the
 * counts cannot drift apart — counting `pending` against capacity in one place
 * and not the other is exactly the bug `TASKS.md` section 6 warns about.
 */
function toEventContext(
  event: EventRecord,
  rows: Registration[],
  usersById: Map<string, User>,
  viewer: User,
): EventWithContext {
  return {
    event,
    // Organizer first, then co-hosts, skipping anyone no longer in the user
    // list so a stale id cannot put a hole in the array.
    hosts: [event.organizerId, ...event.coHostIds]
      .map((id) => usersById.get(id))
      .filter((user): user is User => user !== undefined),
    // Only `going` counts against capacity — see TASKS.md section 4.
    goingCount: rows.filter((row) => row.status === "going").length,
    pendingCount: rows.filter((row) => row.status === "pending").length,
    viewerRegistration: rows.find((row) => row.userId === viewer.id) ?? null,
    viewerCanManage: canManageEvent(event, viewer),
  };
}
