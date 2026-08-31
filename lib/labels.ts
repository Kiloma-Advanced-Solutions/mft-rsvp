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
  delete: "Delete event",
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

/* ------------------------------------------------------------- management */

/**
 * Creating, editing, publishing and deleting an event.
 *
 * The board, the create page and the detail page's edit mode all read from
 * here, so the same action is never called two different things.
 */
export const MANAGE_LABELS = {
  /** The board's entry point into creation. */
  create: "New event",
  createTitle: "New event",
  createDescription:
    "It starts as a draft, so nobody else can see it until you publish.",
  createSubmit: "Create draft",
  /** Leaves edit mode without leaving the event. */
  backToEvent: "Back to event",
  editTitle: "Editing this event",
  editDescription: "Everyone still sees the same screen. You just see more of it.",
  editSubmit: "Save changes",
  cancel: "Cancel",
};

/** The fields of the event form, and the guidance that goes with them. */
export const EVENT_FORM_LABELS = {
  title: "Title",
  summary: "Summary",
  /**
   * Guidance, not a limit. Nothing enforces a length -- the card line-clamps a
   * long summary, so a host is trusted to write a sensible one.
   */
  summaryHint: "One sentence, shown on cards. Around 110 characters reads best.",
  description: "Description",
  descriptionHint: "Leave a blank line between paragraphs.",
  startsAt: "Starts",
  endsAt: "Ends",
  category: "Category",
  access: "Access",
  capacity: "Capacity",
  capacityHint: "Confirmed attendees. Leave unlimited for no cap.",
  capacityUnlimited: "No limit on attendees",
  capacityPlaceholder: "e.g. 40",
  locationKind: "How people attend",
  venue: "Venue",
  address: "Address",
  addressHint: "Shown under the venue on the detail page.",
  url: "Joining link",
  platform: "Platform",
  platformHint: 'e.g. "Zoom", "Google Meet".',
  /** Warns the host what switching to invite-only does to current attendees. */
  accessInviteWarning:
    "Switching to invite only hides this event from anyone who is not on its invite list, including people who already have a place.",
  sectionWhen: "When",
  sectionWhere: "Where",
  sectionWho: "Who can get in",
};

/**
 * Why a submission was refused, field by field.
 *
 * Shared by `lib/eventInput.ts` -- which both the form and the route handlers
 * run -- so a refusal is worded identically whether it was caught in the
 * browser or on the server.
 */
export const EVENT_FORM_ERRORS = {
  titleRequired: "Give the event a title.",
  summaryRequired: "Write a one-sentence summary.",
  descriptionRequired: "Describe the event.",
  startsAtInvalid: "Choose when the event starts.",
  endsAtInvalid: "Choose when the event ends.",
  endsAtBeforeStart: "The end has to be after the start.",
  categoryInvalid: "Choose a category.",
  accessInvalid: "Choose how people get in.",
  capacityInvalid: "Capacity has to be a whole number of seats, or unlimited.",
  locationKindInvalid: "Choose how people attend.",
  venueRequired: "Say where it happens.",
  urlRequired: "Add the joining link.",
  /** Shown when the server refuses a form the browser thought was fine. */
  formRejected: "The server refused these changes.",
};

/** What create, edit, publish and delete say once they have been attempted. */
export const MANAGE_ACTION_COPY = {
  /* Server refusals. */
  cannotCreate: "You are not allowed to create events.",
  cannotManage: "You are not allowed to manage this event.",
  alreadyPublished: "This event is already published.",
  notADraft: "Only a draft can be published.",
  /** The event moved or disappeared underneath the request. */
  stale: "This event has changed. Reload the page and try again.",

  /* Toast titles. The server's own message goes underneath as the description. */
  created: "Draft created",
  createFailed: "Could not create the event",
  saved: "Changes saved",
  saveFailed: "Could not save your changes",
  published: "Event published",
  publishFailed: "Could not publish this event",
  deleted: "Event deleted",
  deleteFailed: "Could not delete this event",
};

/** The delete confirmation. `ConfirmDialog` renders it. */
export const DELETE_DIALOG = {
  title: "Delete this event?",
  confirm: "Delete event",
  cancel: "Keep event",
  /** No registrations to lose, so there is nothing extra to warn about. */
  message: "This cannot be undone. The event is removed for everyone.",
};

/**
 * The same warning when people would lose a confirmed place. Deleting an event
 * deletes its registrations too, so saying how many is the difference between a
 * real confirmation and a formality.
 */
export function deleteDialogMessage(goingCount: number): string {
  if (goingCount === 0) return DELETE_DIALOG.message;

  const people = goingCount === 1 ? "1 person" : `${goingCount} people`;
  const have = goingCount === 1 ? "has" : "have";
  return `This cannot be undone. ${people} ${have} a confirmed place and will lose it.`;
}
