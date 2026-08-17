/**
 * The board's URL contract.
 *
 * Filters live in the query string rather than in component state. The server
 * does the filtering, so a filtered board survives a reload, can be sent to
 * someone, and never has to ship events the viewer may not see just so the
 * browser can hide them again.
 *
 * Deliberately free of `lib/db.ts`, so the page and the client-side filter bar
 * can both import it.
 */

import { CATEGORY_ORDER } from "./labels";
import type { EventAccess, EventCategory } from "./types";

export const CATEGORY_PARAM = "category";
export const ACCESS_PARAM = "access";

/** Open first, invite last — least to most restrictive. */
export const ACCESS_ORDER: EventAccess[] = ["open", "approval", "invite"];

/** `null` means "no filter", not "a filter that matches nothing". */
export type BoardFilters = {
  category: EventCategory | null;
  access: EventAccess | null;
};

/** `?category=a&category=b` arrives as an array. Take the first, ignore the rest. */
function readOne(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Unknown values are dropped rather than 404ing — a stale or hand-edited link
 * should still show a board, just an unfiltered one.
 */
export function parseBoardFilters(searchParams: {
  [key: string]: string | string[] | undefined;
}): BoardFilters {
  const category = readOne(searchParams[CATEGORY_PARAM]);
  const access = readOne(searchParams[ACCESS_PARAM]);

  return {
    category: CATEGORY_ORDER.find((value) => value === category) ?? null,
    access: ACCESS_ORDER.find((value) => value === access) ?? null,
  };
}

/** The query string for a given set of filters, as a link the board can use. */
export function boardHref(filters: BoardFilters): string {
  const params = new URLSearchParams();
  if (filters.category) params.set(CATEGORY_PARAM, filters.category);
  if (filters.access) params.set(ACCESS_PARAM, filters.access);

  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}

export function hasActiveFilters(filters: BoardFilters): boolean {
  return filters.category !== null || filters.access !== null;
}
