/**
 * The words the product uses, in one place.
 *
 * Copy is part of the design. If every screen invents its own phrasing for
 * "approval needed" the app stops feeling like one product, so put user-facing
 * vocabulary here and import it rather than typing strings into JSX.
 */

import type { BadgeTone } from "@/components/ui";
import type {
  EventAccess,
  EventCategory,
  EventLocation,
  EventStatus,
  RegistrationStatus,
} from "./types";

/* ------------------------------------------------------------------ access */

export const ACCESS_LABELS: Record<EventAccess, string> = {
  open: "Open",
  approval: "Approval needed",
  invite: "Invite only",
};

/** The longer explanation, for forms and the detail page. */
export const ACCESS_DESCRIPTIONS: Record<EventAccess, string> = {
  open: "Anyone can see this event and register in one click.",
  approval: "Anyone can see this event, but you decide who gets in.",
  invite: "Only people you invite can see this event at all.",
};

export const ACCESS_TONES: Record<EventAccess, BadgeTone> = {
  open: "success",
  approval: "warning",
  invite: "primary",
};

/** Fixed order for access filters and pickers, so the options never shuffle. */
export const ACCESS_ORDER: EventAccess[] = ["open", "approval", "invite"];

/* ------------------------------------------------------------------ status */

export const EVENT_STATUS_LABELS: Record<EventStatus, string> = {
  draft: "Draft",
  published: "Published",
  cancelled: "Cancelled",
};

export const EVENT_STATUS_TONES: Record<EventStatus, BadgeTone> = {
  draft: "neutral",
  published: "success",
  cancelled: "danger",
};

/* ----------------------------------------------------------- registrations */

export const REGISTRATION_LABELS: Record<RegistrationStatus, string> = {
  going: "Going",
  pending: "Awaiting approval",
  rejected: "Not approved",
  cancelled: "Not going",
  waitlisted: "Waitlisted",
};

export const REGISTRATION_TONES: Record<RegistrationStatus, BadgeTone> = {
  going: "success",
  pending: "warning",
  rejected: "danger",
  cancelled: "neutral",
  waitlisted: "info",
};

/* -------------------------------------------------------------- categories */

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  engineering: "Engineering",
  design: "Design",
  product: "Product",
  learning: "Learning",
  social: "Social",
  company: "Company",
};

export const CATEGORY_ORDER: EventCategory[] = [
  "engineering",
  "design",
  "product",
  "learning",
  "social",
  "company",
];

/* ---------------------------------------------------------------- location */

/** "Studio B", "Zoom", "Training Room + Google Meet". */
export function locationLabel(location: EventLocation): string {
  switch (location.kind) {
    case "in_person":
      return location.venue ?? "In person";
    case "online":
      return location.platform ?? "Online";
    case "hybrid":
      return [location.venue, location.platform].filter(Boolean).join(" + ");
  }
}

export const LOCATION_KIND_LABELS: Record<EventLocation["kind"], string> = {
  in_person: "In person",
  online: "Online",
  hybrid: "Hybrid",
};

/* ------------------------------------------------------------------- board */

/** The board's own words: its sections, its filters and its empty states. */
export const BOARD_LABELS = {
  title: "Board",
  upcoming: "Upcoming",
  past: "Past",
  categoryFilter: "Category",
  accessFilter: "Access",
  allCategories: "All categories",
  allAccessModes: "All access modes",
  clearFilters: "Clear filters",
  emptyTitle: "Nothing on the board for you yet",
  emptyDescription:
    "There are no events you can see right now. Events appear here once a host publishes one, or invites you to one.",
  noMatchesTitle: "No events match these filters",
  noMatchesDescription:
    "Nothing you can see matches that combination. Clear the filters to get the whole board back.",
};

/**
 * The board's headline count. `shown` is what the filters left on the board,
 * `total` is everything the viewer is allowed to see.
 */
export function eventCountLabel(shown: number, total: number): string {
  const noun = total === 1 ? "event" : "events";
  if (shown === total) return `${total} ${noun} you can see.`;
  return `Showing ${shown} of ${total} ${noun} you can see.`;
}
