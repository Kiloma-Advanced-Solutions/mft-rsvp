/**
 * The domain model for the Events Board.
 *
 * These types are the contract between the store, the API routes and the UI.
 * Read `TASKS.md` for the behaviour rules that go with them -- the types say
 * what shape the data has, the brief says what the app must do with it.
 */

/* ------------------------------------------------------------------ people */

/**
 * What a person is allowed to do, independent of any single event.
 *
 * - `admin`     -- may manage every event in the system.
 * - `organizer` -- may create events, and manage the ones they host.
 * - `member`    -- may browse and register, nothing else.
 */
export type UserRole = "admin" | "organizer" | "member";

export type User = {
  id: string;
  name: string;
  email: string;
  /** Job title, shown under the name in avatars and host lists. */
  title: string;
  role: UserRole;
  /** Two letters rendered in the avatar when there is no photo. */
  initials: string;
  /** Accent key used to tint this person's avatar. */
  accent: AccentKey;
};

/* ------------------------------------------------------------------ events */

/**
 * How people get into an event. This is the heart of the product.
 *
 * - `open`     -- anyone can see it and registering confirms them immediately.
 * - `approval` -- anyone can see it, but registering only creates a request
 *                 that a host has to approve or reject.
 * - `invite`   -- only hosts and invited people can see it at all. Invited
 *                 people register in one step, like `open`.
 */
export type EventAccess = "open" | "approval" | "invite";

/**
 * Lifecycle of the event itself, separate from who may attend it.
 *
 * - `draft`     -- visible to hosts only, nobody can register.
 * - `published` -- live, visibility follows `access`.
 * - `cancelled` -- still visible to whoever could see it, registration closed.
 */
export type EventStatus = "draft" | "published" | "cancelled";

export type EventCategory =
  | "engineering"
  | "design"
  | "product"
  | "learning"
  | "social"
  | "company";

/** Accent keys map to `--accent-*` tokens in `app/styles/tokens.css`. */
export type AccentKey = "violet" | "blue" | "emerald" | "amber" | "rose" | "cyan";

/**
 * Where the event happens. Kept deliberately flat rather than a discriminated
 * union so that a single form can edit it without branching field sets.
 * `kind` decides which of the optional fields are meaningful.
 */
export type EventLocation = {
  kind: "in_person" | "online" | "hybrid";
  /** Room or building, for `in_person` and `hybrid`. */
  venue?: string;
  /** Street address, for `in_person` and `hybrid`. */
  address?: string;
  /** Meeting link, for `online` and `hybrid`. */
  url?: string;
  /** e.g. "Zoom", "Google Meet" -- for `online` and `hybrid`. */
  platform?: string;
};

export type EventRecord = {
  id: string;
  title: string;
  /** One sentence, shown on cards. Keep it under ~110 characters. */
  summary: string;
  /** Long form copy for the detail page. Plain text, newlines separate paragraphs. */
  description: string;
  /** ISO 8601 timestamp. */
  startsAt: string;
  /** ISO 8601 timestamp. Always after `startsAt`. */
  endsAt: string;
  location: EventLocation;
  category: EventCategory;
  accent: AccentKey;
  /** Maximum confirmed attendees, or `null` for unlimited. */
  capacity: number | null;
  access: EventAccess;
  status: EventStatus;
  /** The user who created the event. Always a host. */
  organizerId: string;
  /** Extra users who may manage the event alongside the organizer. */
  coHostIds: string[];
  /** Only meaningful when `access` is `invite`. */
  invitedUserIds: string[];
  createdAt: string;
  updatedAt: string;
};

/* ----------------------------------------------------------- registrations */

/**
 * Where a person stands with respect to one event.
 *
 * - `going`      -- confirmed, counts against capacity.
 * - `pending`    -- awaiting a host decision (only on `approval` events).
 * - `rejected`   -- a host declined the request.
 * - `cancelled`  -- the person withdrew.
 * - `waitlisted` -- the event was full when they registered. Stretch goal;
 *                   nothing in the skeleton produces this status yet.
 * - `removed`    -- a host or admin took back a confirmed place. Not the
 *                   person's own answer (`cancelled`) and not a decision on a
 *                   request (`rejected`). Blocks registering again while the
 *                   event's access is `approval` or `invite`; an `open` event
 *                   lets them back in on their own.
 */
export type RegistrationStatus =
  | "going"
  | "pending"
  | "rejected"
  | "cancelled"
  | "waitlisted"
  | "removed";

export type Registration = {
  id: string;
  eventId: string;
  userId: string;
  status: RegistrationStatus;
  /** Optional note the attendee sends with an approval request. */
  message?: string;
  createdAt: string;
  updatedAt: string;
  /** Who approved or rejected, when the status was decided by a host. */
  decidedBy?: string;
  decidedAt?: string;
};

/* ------------------------------------------------------------ view helpers */

/**
 * An event plus the derived facts a screen almost always needs alongside it.
 * Nothing in the skeleton builds one of these yet -- deriving it is part of the
 * task, and where you put that logic is one of the decisions being reviewed.
 */
export type EventWithContext = {
  event: EventRecord;
  hosts: User[];
  goingCount: number;
  pendingCount: number;
  /** The current viewer's registration, if they have one. */
  viewerRegistration: Registration | null;
  /** Whether the current viewer may edit or delete this event. */
  viewerCanManage: boolean;
};

/**
 * Whether the viewer may act on their own registration, and if not, why.
 *
 * The shape is a union rather than a bag of booleans so a screen cannot render
 * "register" and "this event is full" at the same time. Produced by
 * `getRegistrationAvailability()` in `lib/permissions.ts` from the rules in
 * `TASKS.md` section 4.
 */
export type RegistrationClosedReason =
  | "draft"
  | "cancelled"
  | "started"
  | "full"
  | "rejected"
  | "removed"
  | "not_invited";

export type RegistrationAvailability =
  /** Nothing stands in the way. `request` is the `approval` flavour. */
  | { state: "open"; action: "register" | "request" }
  /** Already in, and may step back out again. */
  | { state: "registered"; action: "withdraw"; status: "going" | "pending" }
  /** No action to offer. `reason` decides what the screen says instead. */
  | { state: "closed"; reason: RegistrationClosedReason };

/**
 * What, if anything, a host may decide about one request right now.
 *
 * Approving and rejecting close for different reasons, so the union has a state
 * for each combination rather than a pair of booleans: a full event still takes
 * a rejection, and a request that was already turned down may still be approved
 * but not turned down twice.
 *
 * Produced by `getRequestDecisionAvailability()` in `lib/permissions.ts` from
 * the rules in `TASKS.md` section 4.
 */
export type RequestDecisionClosedReason =
  | "draft"
  | "cancelled"
  | "started"
  | "full"
  /** The registration is not a request a host can act on any more. */
  | "not_decidable";

export type RequestDecisionAvailability =
  /** A pending request on an event with room: both decisions are on offer. */
  | { state: "open" }
  /** Already turned down. A host may still approve it -- `TASKS.md` section 4. */
  | { state: "approve_only" }
  /** Full, so approving would go past capacity. Turning it down still works. */
  | { state: "reject_only"; reason: "full" }
  /** Neither decision is available. `reason` decides what the screen says. */
  | { state: "closed"; reason: RequestDecisionClosedReason };

/**
 * Whether an event may be cancelled right now, and if not, why.
 *
 * Cancelling is `published -> cancelled` and nothing else, and only before the
 * event starts. Like `RequestDecisionAvailability` it says nothing about who is
 * asking -- *whether* the actor may cancel at all is `canManageEvent()`.
 *
 * Produced by `getCancellationAvailability()` in `lib/permissions.ts`, which
 * the detail page and the cancel route both call.
 */
export type CancellationClosedReason = "draft" | "cancelled" | "started";

export type CancellationAvailability =
  | { state: "open" }
  | { state: "closed"; reason: CancellationClosedReason };

/**
 * Whether a host may take back one confirmed place right now, and if not, why.
 *
 * About a row somebody else owns, like `RequestDecisionAvailability`, and it
 * says nothing about who is asking -- *whether* the actor may remove anyone is
 * `canManageEvent()`. It does name the *target*: someone who may manage the
 * event themselves is not removable this way, and steps back out by
 * withdrawing like anyone else.
 *
 * Produced by `getAttendeeRemovalAvailability()` in `lib/permissions.ts`.
 */
export type AttendeeRemovalClosedReason =
  | "draft"
  | "cancelled"
  | "started"
  /** An `open` event admits anyone, so a host has no say over who attends. */
  | "open_access"
  /** Only a confirmed (`going`) place can be taken back. */
  | "not_going"
  /** The attendee may manage the event themselves. */
  | "manager";

export type AttendeeRemovalAvailability =
  | { state: "open" }
  | { state: "closed"; reason: AttendeeRemovalClosedReason };

/**
 * Whether a host may give a removed attendee their place back right now, and
 * if not, why.
 *
 * Restoring raises the `going` count, so capacity closes it. Like removal it
 * takes no actor. On an `open` event it is closed: the removed person may
 * register again on their own, so a host has nothing to restore.
 *
 * Produced by `getAttendeeRestoreAvailability()` in `lib/permissions.ts`.
 */
export type AttendeeRestoreClosedReason =
  | "draft"
  | "cancelled"
  | "started"
  /** The removed person may register again themselves. */
  | "open_access"
  /** Only a `removed` row can be restored. */
  | "not_removed"
  | "full";

export type AttendeeRestoreAvailability =
  | { state: "open" }
  | { state: "closed"; reason: AttendeeRestoreClosedReason };

/**
 * Whether anybody may be added to an event's invite list right now, and if not,
 * why.
 *
 * About the event alone, like `CancellationAvailability`: who is asking is
 * `canManageEvent()`, and who would be invited is
 * `InvitationAvailability`. A draft is open -- it is invisible to invitees
 * anyway, and it is where a host builds the list before publishing.
 *
 * Produced by `getInvitationListAvailability()` in `lib/permissions.ts`.
 */
export type InvitationListClosedReason =
  /**
   * The event is not invite-only, so its list decides nothing right now. The
   * rows are kept, dormant, and count again if the event goes back to `invite`.
   */
  | "not_invite_access"
  | "cancelled"
  | "started";

export type InvitationListAvailability =
  | { state: "open" }
  | { state: "closed"; reason: InvitationListClosedReason };

/**
 * Whether one person may be invited to an event right now, and if not, why.
 *
 * Takes no actor, like the attendee rules, but names the *target*: someone who
 * may manage the event already sees it, so an invitation would mean nothing.
 * Never consults the person's registration -- an invitation and a registration
 * are separate things, and inviting writes no registration.
 *
 * Produced by `getInvitationAvailability()` in `lib/permissions.ts`.
 */
export type InvitationClosedReason =
  | InvitationListClosedReason
  /** The person may manage the event, and sees it without an invitation. */
  | "manager"
  | "already_invited";

export type InvitationAvailability =
  | { state: "open" }
  | { state: "closed"; reason: InvitationClosedReason };

/**
 * Whether one person's invitation may be revoked right now, and if not, why.
 *
 * Deliberately not closed by the event's lifecycle: inviting widens who can see
 * the event, revoking only narrows it, and a host may still need to take access
 * to a confidential event back after it was cancelled or has started. Like
 * inviting, it never touches the person's registration.
 *
 * Produced by `getInvitationRevocationAvailability()` in `lib/permissions.ts`.
 */
export type InvitationRevocationClosedReason =
  | "not_invite_access"
  | "not_invited";

export type InvitationRevocationAvailability =
  | { state: "open" }
  | { state: "closed"; reason: InvitationRevocationClosedReason };

/**
 * One request as the host's approval queue needs it: the row, the person behind
 * it, whether they can still see what they asked to join, and what the host may
 * do about it.
 *
 * `requesterCanView` exists because a row can outlive its author's access -- a
 * host switching an event to `invite` leaves every registration in place while
 * removing visibility for anyone off the invite list. The queue says so rather
 * than hiding the request or deciding it on the host's behalf.
 */
export type EventRequest = {
  registration: Registration;
  requester: User;
  /** Whether the requester can still see the event they requested a place at. */
  requesterCanView: boolean;
  decision: RequestDecisionAvailability;
};

/**
 * What the detail screen needs on top of `EventWithContext`: the people who are
 * actually going, not just how many. Deliberately a separate type -- the board
 * wants the counts and not the bodies, and making this field part of
 * `EventWithContext` would have it assembled for every card that ignores it.
 */
export type EventDetailContext = EventWithContext & {
  /** Confirmed (`going`) attendees, in registration order. */
  attendees: User[];
  /**
   * The `pending` and `rejected` rows a host may decide, in registration order.
   *
   * **Empty for anyone who may not manage the event**, so who asked and what
   * they wrote is never assembled for a viewer who has no business seeing it.
   * An empty array therefore means "nothing to decide, or not yours to decide";
   * `viewerCanManage` is what tells the two apart.
   */
  requests: EventRequest[];
  /**
   * The `going` and `removed` rows a host may take back or give back, in
   * registration order, each with what may be done about it.
   *
   * **Empty for anyone who may not manage the event**, exactly like `requests`:
   * registration ids and who was removed are never assembled for a viewer who
   * has no business seeing them. `attendees` above stays what everyone sees.
   */
  managedAttendees: ManagedAttendee[];
  /**
   * Who is invited, and who could be, as the host's invitation list needs it.
   *
   * **`null` for anyone who may not manage the event** -- an invitee
   * included -- so the list, the candidates and what may be done about them
   * are never assembled for a viewer who has no business seeing them. Unlike
   * `requests`, an empty list is meaningful to a host (it is where inviting
   * starts), so "not yours" is `null` rather than empty.
   */
  invitations: EventInvitations | null;
};

/**
 * The host's view of an event's invite list.
 *
 * Built only for a manager, with every answer already worked out by the rules
 * in `lib/permissions.ts`, so the screen derives nothing. It is about who may
 * *see* the event: nothing here is a seat, and capacity plays no part.
 */
export type EventInvitations = {
  /**
   * Whether the list decides anything right now -- the event is invite-only.
   * When it is not, the rows are kept exactly as they were, read-only, and
   * count again if the event goes back to `invite`.
   */
  active: boolean;
  /** Whether anybody may be added right now, and if not, why. */
  inviting: InvitationListAvailability;
  /** Everyone on the list, in the user list's order. */
  invitees: InvitedPerson[];
  /**
   * Everyone who may be invited right now, in the same order. Empty whenever
   * `inviting` is closed, and never anyone already invited or anyone who may
   * manage the event.
   */
  candidates: User[];
};

/**
 * One person on the invite list: who they are, where they stand at the event,
 * and whether their invitation may be revoked.
 *
 * `registrationStatus` is the person's own registration, read and never
 * written -- an invitation does not imply one, so `null` means they have not
 * registered at all.
 */
export type InvitedPerson = {
  invitee: User;
  registrationStatus: RegistrationStatus | null;
  revocation: InvitationRevocationAvailability;
};

/**
 * One attendee as the host's attendee list needs them: the row's id, the
 * person, and what the host may do about their place right now.
 *
 * Every row also carries whether the person can still see the event. An
 * invitation and a registration are separate, so either can change without the
 * other: revoking an invitation leaves a confirmed place standing, and an
 * access change can hide the event from somebody who was removed. The list says
 * so rather than fixing it, the same way the approval queue treats a request
 * whose author lost sight of the event.
 */
export type ManagedAttendee =
  | {
      status: "going";
      registrationId: string;
      attendee: User;
      /** Still holds a place, but may no longer be able to see the event. */
      attendeeCanView: boolean;
      removal: AttendeeRemovalAvailability;
    }
  | {
      status: "removed";
      registrationId: string;
      attendee: User;
      attendeeCanView: boolean;
      restore: AttendeeRestoreAvailability;
    };
