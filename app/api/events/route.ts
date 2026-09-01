/**
 * Creating an event.
 *
 *   POST /api/events  -> { event }   body: the nine content fields
 *
 * Follows the house style in `app/api/session/route.ts`: wrapped in
 * `withErrorHandling`, the body read with `readJson`, an `ApiError` for
 * anything the caller got wrong, a plain object on success.
 *
 * The split between what the caller may say and what the server decides is the
 * point of this file. The caller describes the event; the server owns who it
 * belongs to, whether it is live, and what colour it is. Nothing in the body can
 * reach `organizerId`, `coHostIds`, `invitedUserIds`, `status` or `accent` --
 * `parseEventBody` does not read those fields at all, so there is no field to
 * overwrite and no ordering bug that could let one through.
 */

import { ApiError, jsonOk, readJson, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { parseEventBody } from "@/lib/eventInput";
import { EVENT_FORM_ERRORS, MANAGE_ACTION_COPY } from "@/lib/labels";
import { canCreateEvent } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { AccentKey } from "@/lib/types";

/**
 * The six accent tokens, in the order they are defined in
 * `app/styles/tokens.css`. Private on purpose: an accent is a tint, not part of
 * the product's vocabulary, so it has no home in `lib/labels.ts`.
 */
const ACCENTS: AccentKey[] = [
  "violet",
  "blue",
  "emerald",
  "amber",
  "rose",
  "cyan",
];

/**
 * Which tint a new event gets.
 *
 * An accent is decorative -- it colours the card and the date block on the
 * board and appears nowhere on the event's own page -- so a host is not asked
 * to choose one. Derived from the title rather than drawn at random so the
 * result is stable across a reset-and-recreate, and spread across all six
 * rather than fixed so the board keeps the variety the fixtures demonstrate.
 */
function accentForTitle(title: string): AccentKey {
  let sum = 0;
  for (let index = 0; index < title.length; index += 1) {
    sum += title.charCodeAt(index);
  }
  return ACCENTS[sum % ACCENTS.length];
}

/**
 * Create a draft.
 *
 * A new event is always a `draft`: it is visible only to its hosts and to
 * admins until someone publishes it through
 * `POST /api/events/[id]/publish`, so a half-finished event is never briefly
 * live. The creator becomes the `organizerId` and is therefore a host, which is
 * what `canManageEvent()` answers for every request after this one.
 */
export const POST = withErrorHandling(async (request: Request) => {
  const viewer = await getCurrentUser();

  // Role, not per-event: there is no event yet to be a host of. Nothing here
  // could confirm the existence of anything, so a refusal is an honest 403.
  if (!canCreateEvent(viewer)) {
    throw ApiError.forbidden(MANAGE_ACTION_COPY.cannotCreate);
  }

  const body = await readJson(request);
  const parsed = parseEventBody(body);
  if (!parsed.ok) {
    throw ApiError.badRequest(EVENT_FORM_ERRORS.formRejected, parsed.errors);
  }

  const event = await db.events.create({
    ...parsed.value,
    // Everything below is the server's to decide.
    organizerId: viewer.id,
    coHostIds: [],
    invitedUserIds: [],
    status: "draft",
    accent: accentForTitle(parsed.value.title),
  });

  return jsonOk({ event }, 201);
});
