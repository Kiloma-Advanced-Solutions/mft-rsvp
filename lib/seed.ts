/**
 * Seed data for the in-memory store.
 *
 * SERVER ONLY. Timestamps are computed relative to "now" the first time the
 * store is created, so the board always has a sensible past/present/future
 * spread no matter when you run the workshop. Never import this from a Client
 * Component -- go through an API route.
 *
 * The spread is deliberate. Between them these fixtures cover every access
 * mode, every event status, a full event, a past event, a draft, a cancellation
 * and all five registration statuses. If you change the fixtures, keep that
 * coverage -- it is what makes the board worth looking at.
 */

import type { EventRecord, Registration, User } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

/** An ISO timestamp `dayOffset` days from today, at the given local time. */
function at(dayOffset: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  date.setDate(date.getDate() + dayOffset);
  return date.toISOString();
}

/** An ISO timestamp `days` days in the past, used for created/updated stamps. */
function daysAgo(days: number): string {
  return new Date(Date.now() - days * DAY_MS).toISOString();
}

/* ------------------------------------------------------------------ people */

export const SEED_USERS: User[] = [
  {
    id: "u-maya",
    name: "Maya Cohen",
    email: "maya@northwind.dev",
    title: "VP Engineering",
    role: "organizer",
    initials: "MC",
    accent: "violet",
  },
  {
    id: "u-daniel",
    name: "Daniel Ross",
    email: "daniel@northwind.dev",
    title: "Design Lead",
    role: "organizer",
    initials: "DR",
    accent: "blue",
  },
  {
    id: "u-priya",
    name: "Priya Nair",
    email: "priya@northwind.dev",
    title: "Product Manager",
    role: "member",
    initials: "PN",
    accent: "emerald",
  },
  {
    id: "u-tom",
    name: "Tom Alvarez",
    email: "tom@northwind.dev",
    title: "Backend Engineer",
    role: "member",
    initials: "TA",
    accent: "amber",
  },
  {
    id: "u-sara",
    name: "Sara Klein",
    email: "sara@northwind.dev",
    title: "People Operations",
    role: "admin",
    initials: "SK",
    accent: "rose",
  },
];

/** Who you are when you first open the app, before picking another persona. */
export const DEFAULT_USER_ID = "u-maya";

/* ------------------------------------------------------------------ events */

export function createSeedEvents(): EventRecord[] {
  const stamp = { createdAt: daysAgo(21), updatedAt: daysAgo(3) };

  return [
    {
      ...stamp,
      id: "e-design-critique",
      title: "Design Critique: Onboarding V3",
      summary:
        "Walk through the third pass at the signup flow and pressure-test it before build.",
      description:
        "We will review the latest onboarding prototype end to end, then spend the back half on the two open questions: whether the workspace step can be deferred, and how much we explain before asking for an email.\n\nBring your critique in writing if you can. Screens go out the evening before so nobody is seeing them cold.",
      startsAt: at(2, 14),
      endsAt: at(2, 15, 30),
      location: {
        kind: "hybrid",
        venue: "Studio B",
        address: "14 Rothschild Blvd, Tel Aviv",
        url: "https://meet.example.com/critique-v3",
        platform: "Google Meet",
      },
      category: "design",
      accent: "blue",
      capacity: 12,
      access: "approval",
      status: "published",
      organizerId: "u-daniel",
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-eng-allhands",
      title: "Engineering All-Hands",
      summary:
        "Quarterly engineering update: roadmap, headcount, and the platform migration status.",
      description:
        "Thirty minutes of update, thirty minutes of questions. The migration section will be detailed — if you own a service that has not been cut over yet, this is the one to attend.\n\nRecorded and posted afterwards for anyone who cannot make the time slot.",
      startsAt: at(4, 10),
      endsAt: at(4, 11),
      location: {
        kind: "online",
        url: "https://meet.example.com/eng-all-hands",
        platform: "Google Meet",
      },
      category: "company",
      accent: "violet",
      capacity: null,
      access: "open",
      status: "published",
      organizerId: "u-maya",
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-friday-social",
      title: "Friday Rooftop Social",
      summary: "Drinks, decent food, and no laptops. Partners welcome.",
      description:
        "The rooftop is booked from five. There is a bar, there is food, and there is a hard stop at nine when the building locks up.\n\nLet us know about dietary requirements when you register and we will pass them on to the caterer.",
      startsAt: at(3, 17),
      endsAt: at(3, 21),
      location: {
        kind: "in_person",
        venue: "Rooftop Terrace",
        address: "14 Rothschild Blvd, Tel Aviv",
      },
      category: "social",
      accent: "rose",
      capacity: 40,
      access: "open",
      status: "published",
      organizerId: "u-sara",
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-leadership-offsite",
      title: "Leadership Offsite Planning",
      summary: "Shape the agenda and budget for the winter leadership offsite.",
      description:
        "Working session, not a presentation. We need to land on a location, a two-day agenda and a number we can take to finance by the end of the month.\n\nCome with one strong opinion about what last year's offsite got wrong.",
      startsAt: at(6, 9, 30),
      endsAt: at(6, 12),
      location: {
        kind: "in_person",
        venue: "Boardroom",
        address: "14 Rothschild Blvd, Tel Aviv",
      },
      category: "company",
      accent: "amber",
      capacity: 8,
      access: "invite",
      status: "published",
      organizerId: "u-sara",
      coHostIds: [],
      invitedUserIds: ["u-maya", "u-daniel"],
    },
    {
      ...stamp,
      id: "e-comp-review",
      title: "Compensation Review Sync",
      summary: "Calibration for the mid-year compensation cycle.",
      description:
        "Closed session. We will go band by band and calibrate the proposed adjustments before anything goes to the board.\n\nMaterials are shared in the meeting, not before.",
      startsAt: at(8, 11),
      endsAt: at(8, 12, 30),
      location: {
        kind: "online",
        url: "https://meet.example.com/comp-sync",
        platform: "Zoom",
      },
      category: "company",
      accent: "blue",
      capacity: null,
      access: "invite",
      status: "published",
      organizerId: "u-sara",
      coHostIds: [],
      invitedUserIds: ["u-maya"],
    },
    {
      ...stamp,
      id: "e-ts-workshop",
      title: "TypeScript Deep Dive Workshop",
      summary:
        "Three hours on the type system: generics, inference, and the patterns worth the complexity.",
      description:
        "Hands-on. Bring a laptop with the repo already cloned and installed — we will not spend workshop time on setup.\n\nWe start from conditional types and end by typing a small end-to-end API client. The middle section on inference is the part people say changed how they write day to day.",
      startsAt: at(9, 13),
      endsAt: at(9, 16),
      location: {
        kind: "hybrid",
        venue: "Training Room",
        address: "14 Rothschild Blvd, Tel Aviv",
        url: "https://meet.example.com/ts-deep-dive",
        platform: "Google Meet",
      },
      category: "learning",
      accent: "emerald",
      capacity: 20,
      access: "approval",
      status: "published",
      organizerId: "u-maya",
      coHostIds: ["u-daniel"],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-product-review",
      title: "Q3 Product Review",
      summary: "What shipped, what slipped, and what the numbers say about both.",
      description:
        "Each squad gets ten minutes: one slide on outcomes, one on what you learned, no status updates.\n\nThe second hour is reserved for the two decisions we deferred last quarter.",
      startsAt: at(11, 15),
      endsAt: at(11, 17),
      location: {
        kind: "online",
        url: "https://meet.example.com/q3-review",
        platform: "Zoom",
      },
      category: "product",
      accent: "cyan",
      capacity: null,
      access: "open",
      status: "published",
      organizerId: "u-daniel",
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-oncall-training",
      title: "On-call Onboarding",
      summary:
        "Everything you need before your first rotation. Small group, hands on the real runbooks.",
      description:
        "We page you on purpose, twice, and walk through what you did afterwards. Uncomfortable and by far the fastest way to learn the escalation path.\n\nKept deliberately small so everyone gets a turn driving.",
      startsAt: at(14, 10),
      endsAt: at(14, 13),
      location: {
        kind: "in_person",
        venue: "War Room",
        address: "14 Rothschild Blvd, Tel Aviv",
      },
      category: "learning",
      accent: "violet",
      capacity: 3,
      access: "approval",
      status: "published",
      organizerId: "u-maya",
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-hack-day",
      title: "Internal Hack Day",
      summary: "One day, any idea, demos at five. Still being planned.",
      description:
        "Draft — the date is provisional and catering is not booked yet. Do not share this one around until it is published.\n\nThe plan is teams of up to four, a five-minute demo slot each, and a genuinely good prize.",
      startsAt: at(21, 9),
      endsAt: at(21, 18),
      location: {
        kind: "in_person",
        venue: "Whole 3rd Floor",
        address: "14 Rothschild Blvd, Tel Aviv",
      },
      category: "engineering",
      accent: "emerald",
      capacity: 60,
      access: "open",
      status: "draft",
      organizerId: "u-maya",
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-postmortem",
      title: "Postmortem: Checkout Outage",
      summary: "Cancelled — folded into the engineering all-hands instead.",
      description:
        "We are covering this in the all-hands rather than running a separate session. The written postmortem is already in the incident channel.\n\nIf you wanted the deep technical walkthrough, say so and we will schedule one.",
      startsAt: at(5, 16),
      endsAt: at(5, 17),
      location: {
        kind: "online",
        url: "https://meet.example.com/checkout-postmortem",
        platform: "Zoom",
      },
      category: "engineering",
      accent: "amber",
      capacity: null,
      access: "open",
      status: "cancelled",
      organizerId: "u-maya",
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-sprint-retro",
      title: "Sprint 42 Retro",
      summary: "What worked, what did not, and the two things we will change.",
      description:
        "Standard format: gather data, generate insight, decide on actions. Forty-five minutes, hard stop.\n\nActions from last retro get reviewed first — we have been bad at closing those.",
      startsAt: at(-3, 11),
      endsAt: at(-3, 11, 45),
      location: {
        kind: "online",
        url: "https://meet.example.com/sprint-42-retro",
        platform: "Google Meet",
      },
      category: "engineering",
      accent: "cyan",
      capacity: null,
      access: "open",
      status: "published",
      organizerId: "u-daniel",
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: "e-new-hire-breakfast",
      title: "New Hire Welcome Breakfast",
      summary: "Pastries and introductions for everyone who joined this month.",
      description:
        "Informal. Come and meet the six people who started in the last four weeks.\n\nNo agenda beyond good coffee and name badges nobody will wear.",
      startsAt: at(-10, 8, 30),
      endsAt: at(-10, 10),
      location: {
        kind: "in_person",
        venue: "Kitchen & Lounge",
        address: "14 Rothschild Blvd, Tel Aviv",
      },
      category: "social",
      accent: "rose",
      capacity: 30,
      access: "open",
      status: "published",
      organizerId: "u-sara",
      coHostIds: [],
      invitedUserIds: [],
    },
  ];
}

/* ----------------------------------------------------------- registrations */

type SeedRegistration = Omit<Registration, "id" | "createdAt" | "updatedAt">;

export function createSeedRegistrations(): Registration[] {
  const rows: SeedRegistration[] = [
    // Approval event: one confirmed, one still waiting, one turned down.
    { eventId: "e-design-critique", userId: "u-maya", status: "going" },
    {
      eventId: "e-design-critique",
      userId: "u-priya",
      status: "pending",
      message: "I own the activation metric for this flow — would like to be in the room.",
    },
    {
      eventId: "e-design-critique",
      userId: "u-tom",
      status: "rejected",
      decidedBy: "u-daniel",
      decidedAt: daysAgo(2),
    },

    // Open event, no capacity: everyone piles in.
    { eventId: "e-eng-allhands", userId: "u-priya", status: "going" },
    { eventId: "e-eng-allhands", userId: "u-tom", status: "going" },
    { eventId: "e-eng-allhands", userId: "u-daniel", status: "going" },
    { eventId: "e-eng-allhands", userId: "u-sara", status: "going" },

    // Open event with room to spare, plus someone who dropped out.
    { eventId: "e-friday-social", userId: "u-maya", status: "going" },
    { eventId: "e-friday-social", userId: "u-daniel", status: "going" },
    { eventId: "e-friday-social", userId: "u-priya", status: "going" },
    { eventId: "e-friday-social", userId: "u-tom", status: "cancelled" },

    // Invite-only: only invited people are in here at all.
    { eventId: "e-leadership-offsite", userId: "u-maya", status: "going" },
    { eventId: "e-comp-review", userId: "u-maya", status: "going" },

    // Approval event with a request the current default persona can act on.
    {
      eventId: "e-ts-workshop",
      userId: "u-tom",
      status: "pending",
      message: "Mostly want the inference section — happy to take a spot on the waitlist.",
    },
    { eventId: "e-ts-workshop", userId: "u-priya", status: "going" },

    { eventId: "e-product-review", userId: "u-priya", status: "going" },

    // Capacity 3 and three confirmed: this event is full.
    { eventId: "e-oncall-training", userId: "u-priya", status: "going" },
    { eventId: "e-oncall-training", userId: "u-tom", status: "going" },
    { eventId: "e-oncall-training", userId: "u-daniel", status: "going" },

    // Cancelled event that still has people attached to it.
    { eventId: "e-postmortem", userId: "u-tom", status: "going" },
    { eventId: "e-postmortem", userId: "u-priya", status: "cancelled" },

    // Past events, so "my events" has some history to show.
    { eventId: "e-sprint-retro", userId: "u-priya", status: "going" },
    { eventId: "e-sprint-retro", userId: "u-tom", status: "going" },
    { eventId: "e-sprint-retro", userId: "u-daniel", status: "going" },
    { eventId: "e-new-hire-breakfast", userId: "u-maya", status: "going" },
    { eventId: "e-new-hire-breakfast", userId: "u-priya", status: "going" },
    { eventId: "e-new-hire-breakfast", userId: "u-tom", status: "going" },
  ];

  return rows.map((row, index) => ({
    ...row,
    id: `r-${String(index + 1).padStart(3, "0")}`,
    createdAt: daysAgo(14 - (index % 12)),
    updatedAt: daysAgo(2),
  }));
}
