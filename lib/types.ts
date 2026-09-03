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
 */
export type RegistrationStatus =
  | "going"
  | "pending"
  | "rejected"
  | "cancelled"
  | "waitlisted";

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
};
