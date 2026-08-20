/**
 * Answers one question: can this person see this event?
 *
 * This is the single place that rule lives, per the visibility table in
 * `TASKS.md` section 4. The board page and `/api/events` both call it, so an
 * invite-only event can never leak through one without the other -- and
 * whatever this file says is what "the board" actually shows, nothing
 * re-derives the rule downstream.
 */

import type { EventRecord, User } from "./types";

/** The event's organizer, or anyone listed as a co-host. */
export function isEventHost(user: User, event: EventRecord): boolean {
  return event.organizerId === user.id || event.coHostIds.includes(user.id);
}

/**
 * | Event                      | member (not invited) | invited member | host | admin |
 * | --------------------------- | --------------------- | -------------- | ---- | ----- |
 * | `draft`, any access          | no                    | no             | yes  | yes   |
 * | `published` + `open`         | yes                   | --             | yes  | yes   |
 * | `published` + `approval`     | yes                   | --             | yes  | yes   |
 * | `published` + `invite`       | no                    | yes            | yes  | yes   |
 * | `cancelled`                  | as if published       | as if published| yes  | yes   |
 */
export function canSeeEvent(user: User, event: EventRecord): boolean {
  if (user.role === "admin") return true;
  if (isEventHost(user, event)) return true;
  if (event.status === "draft") return false;
  if (event.access === "invite") return event.invitedUserIds.includes(user.id);
  return true;
}
