import { ACCESS_ORDER, CATEGORY_ORDER } from "@/lib/labels";
import type { EventAccess, EventCategory } from "@/lib/types";

/**
 * The board's state in the URL: two filters and the section being shown.
 *
 * Everything here is pure, so the page, its filters and anything else that
 * links to a board state agree on one way to read the query string and one
 * way to write it. The values only ever narrow the set the viewer is already
 * allowed to see -- that set is decided before any of this is read.
 *
 * Query values are untrusted input. Anything that is not a known value -- a
 * typo, an empty string, a parameter given twice -- is treated as the
 * default, which is why the parsers return the union rather than casting a
 * string into it.
 */

/** `null` is "no filter", and is the parameter being absent from the URL. */
type CategoryFilter = EventCategory | null;
type AccessFilter = EventAccess | null;

export type BoardSection = "upcoming" | "cancelled" | "past";

/** The sections in navigation order. */
export const BOARD_SECTIONS: BoardSection[] = ["upcoming", "cancelled", "past"];

/** Upcoming is where the board opens, so it is never written into a URL. */
const DEFAULT_SECTION: BoardSection = "upcoming";

export type BoardState = {
  category: CategoryFilter;
  access: AccessFilter;
  section: BoardSection;
};

type QueryValue = string | string[] | undefined;

export function parseCategory(value: QueryValue): CategoryFilter {
  return CATEGORY_ORDER.find((category) => category === value) ?? null;
}

export function parseAccess(value: QueryValue): AccessFilter {
  return ACCESS_ORDER.find((access) => access === value) ?? null;
}

export function parseSection(value: QueryValue): BoardSection {
  return BOARD_SECTIONS.find((section) => section === value) ?? DEFAULT_SECTION;
}

/**
 * The canonical URL of a board state. The parameters always come in the same
 * order and a default is always left out, so each state has exactly one
 * address and the unfiltered upcoming board is plain `/events`.
 */
export function boardHref({ category, access, section }: BoardState): string {
  const params = new URLSearchParams();
  if (category !== null) params.set("category", category);
  if (access !== null) params.set("access", access);
  if (section !== DEFAULT_SECTION) params.set("section", section);

  const query = params.toString();
  return query ? `/events?${query}` : "/events";
}
