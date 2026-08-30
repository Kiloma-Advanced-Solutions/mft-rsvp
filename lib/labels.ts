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
  RegistrationAvailability,
  RegistrationClosedReason,
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

/* ------------------------------------------------------------------ detail */

/** The event detail screen's own words: its sections and its host tools. */
export const DETAIL_LABELS = {
  back: "Back to board",
  about: "About this event",
  hosts: "Hosted by",
  attendees: "Who is going",
  noAttendees: "Nobody has registered yet.",
  hostTools: "Host tools",
  hostToolsDescription: "Only you and other hosts see this.",
  edit: "Edit event",
  publish: "Publish draft",
  /** Said about controls that are in place but not yet wired up. */
  notYetActive: "Not active yet — this arrives in a later milestone.",
  factPending: "Awaiting approval",
  factInvited: "Invited",
};

/**
 * What the registration panel says, for one availability. The rule that
 * produced the availability lives in `lib/permissions.ts`; this only dresses it.
 */
type RegistrationCtaCopy = {
  /** The primary action's label, or `null` when there is nothing to offer. */
  action: string | null;
  /** One line telling the viewer where they stand. */
  note: string;
};

const CLOSED_NOTES: Record<RegistrationClosedReason, string> = {
  draft: "This event is still a draft, so nobody can register yet.",
  cancelled: "This event was cancelled, so registration is closed.",
  started: "This event has passed.",
  full: "This event is full.",
  rejected:
    "Your request was not approved. A host can still approve you from their queue.",
  not_invited: "This event is invite only, and you are not on the invite list.",
};

export function registrationCtaCopy(
  availability: RegistrationAvailability,
): RegistrationCtaCopy {
  switch (availability.state) {
    case "open":
      return availability.action === "request"
        ? {
            action: "Request a place",
            note: "A host decides who gets in, so this creates a request.",
          }
        : { action: "Register", note: "You will be confirmed straight away." };

    case "registered":
      return availability.status === "going"
        ? { action: "Withdraw", note: "You have a confirmed place." }
        : {
            action: "Withdraw",
            note: "Your request is waiting for a host to decide.",
          };

    case "closed":
      return { action: null, note: CLOSED_NOTES[availability.reason] };
  }
}

/**
 * The same sentence the panel shows for a closed registration, for a route
 * handler that has to refuse the action.
 *
 * The rule that produced the reason lives in `lib/permissions.ts`. Reading the
 * wording from here means the API and the screen cannot describe the same
 * refusal differently.
 */
export function registrationClosedNote(
  reason: RegistrationClosedReason,
): string {
  return CLOSED_NOTES[reason];
}

/**
 * What register, request and withdraw say once they have been attempted.
 *
 * The refusals are thrown by the registrations route; the toasts are shown by
 * `RegistrationActions` after the server has answered. They share this object
 * so a refusal is worded the same wherever it surfaces.
 */
export const REGISTRATION_ACTION_COPY = {
  /* Server refusals for the two states `RegistrationClosedReason` cannot name. */
  alreadyRegistered: "You already have a place at this event.",
  nothingToWithdraw: "You do not have a place to withdraw from.",
  /** The registration changed underneath the request. */
  stale: "Your registration has changed. Reload the page and try again.",

  /* Toast titles. The server's own message goes underneath as the description. */
  registered: "You are going",
  requested: "Request sent",
  withdrawn: "You have withdrawn",
  registerFailed: "Could not register",
  requestFailed: "Could not send your request",
  withdrawFailed: "Could not withdraw",
};
