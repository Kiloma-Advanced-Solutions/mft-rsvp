/**
 * The development fixtures, and the single definition of them.
 *
 * The records are rows in SQL Server: `npm run db:seed` and `npm run db:reset`
 * put them there, via `lib/data/seed.mts`, which is the only thing that reads
 * the records themselves. There is no second copy of the data, so the board a
 * developer sees and the rows in the database cannot describe different events.
 *
 * The application reads the fixed ids and the persona order from here --
 * `lib/session.ts` and `/styleguide` both do -- but never the records. Event and
 * registration data comes from the database, through `lib/db.ts`.
 *
 * SERVER ONLY. Timestamps are computed relative to "now" each time the fixtures
 * are built, so the board always has a sensible past/present/future spread no
 * matter when you run the workshop. Never import this from a Client Component --
 * go through an API route.
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

/* --------------------------------------------------------------- identities */

/**
 * The fixtures' own ids, written out as fixed UUIDs rather than generated.
 *
 * They are constants and not `crypto.randomUUID()` calls on purpose: the
 * persona cookie holds a user id, `/styleguide` needs particular events, and
 * `DEFAULT_USER_ID` has to keep resolving -- all of which break if the ids move
 * every time the fixtures are rebuilt. Seeding the database, and resetting it
 * with `npm run db:reset`, therefore always produce the same ids.
 *
 * The values are ordinary random v4 UUIDs with no structure to read: nothing in
 * the app may infer anything from the shape of an id, so the fixtures do not
 * offer a pattern to infer from. Anything outside this file that needs to name
 * a fixture imports one of these constants instead of repeating a literal.
 */
export const SEED_USER_IDS = {
  maya: "ea7cd7ca-ac2a-4dd4-9d17-f03d8994b5cd",
  daniel: "e6bab921-d903-462d-905b-47be7ee09b73",
  priya: "08f76fc8-1c87-48ae-8ed8-b9bef87fa955",
  tom: "d26229c6-2536-45fa-8260-9078832de6c6",
  sara: "565c594d-5784-41c1-96c2-7773b2560a28",
} as const;

export const SEED_EVENT_IDS = {
  designCritique: "d686f48d-d015-410c-aed0-dd05d5aa508c",
  engAllHands: "803b769a-1786-4505-b380-997afd581348",
  fridaySocial: "d11a4086-40d5-45ee-832b-b56b7ff053b9",
  leadershipOffsite: "e2b78cb0-4aba-4c02-b468-f0214721b39a",
  compReview: "73e29fba-3df0-42ec-bad5-6bb7cf4c8ab8",
  tsWorkshop: "713ef77e-faf1-43b5-b36a-7cc9cd3dc489",
  productReview: "3d06089c-4204-494d-b435-9f18b1edd1c3",
  oncallTraining: "8938fef9-11b1-4ece-988f-895a1408ada8",
  hackDay: "92d5ae13-01e2-4b9d-b3a8-69d3b4888ed6",
  postmortem: "f1aeb57f-591d-474e-a004-5fd24bf3af00",
  sprintRetro: "f2c87c47-3a4f-4e23-9521-df3272904bba",
  newHireBreakfast: "dc1f1f72-74f2-4127-aaa4-4b91be73e626",
} as const;

/* ------------------------------------------------------------------ people */

export const SEED_USERS: User[] = [
  {
    id: SEED_USER_IDS.maya,
    name: "Maya Cohen",
    email: "maya@northwind.dev",
    title: "VP Engineering",
    role: "organizer",
    initials: "MC",
    accent: "violet",
  },
  {
    id: SEED_USER_IDS.daniel,
    name: "Daniel Ross",
    email: "daniel@northwind.dev",
    title: "Design Lead",
    role: "organizer",
    initials: "DR",
    accent: "blue",
  },
  {
    id: SEED_USER_IDS.priya,
    name: "Priya Nair",
    email: "priya@northwind.dev",
    title: "Product Manager",
    role: "member",
    initials: "PN",
    accent: "emerald",
  },
  {
    id: SEED_USER_IDS.tom,
    name: "Tom Alvarez",
    email: "tom@northwind.dev",
    title: "Backend Engineer",
    role: "member",
    initials: "TA",
    accent: "amber",
  },
  {
    id: SEED_USER_IDS.sara,
    name: "Sara Klein",
    email: "sara@northwind.dev",
    title: "People Operations",
    role: "admin",
    initials: "SK",
    accent: "rose",
  },
];

/** Who you are when you first open the app, before picking another persona. */
export const DEFAULT_USER_ID = SEED_USER_IDS.maya;

/**
 * The order the personas are offered in, matching the table in `TASKS.md` §3.
 *
 * Display order, not a domain fact: a user row has no intrinsic position, so
 * this is not something the store should be asked to remember. It lives beside
 * `DEFAULT_USER_ID` because both are the same kind of thing -- a named
 * reference into the fixtures -- and it is applied by `listPersonas()` in
 * `lib/session.ts`, which is what owns the persona concept.
 *
 * `db.users.list()` deliberately does not use it: that stays a general-purpose
 * read with no opinion about personas.
 */
export const PERSONA_ORDER: string[] = [
  SEED_USER_IDS.maya,
  SEED_USER_IDS.daniel,
  SEED_USER_IDS.priya,
  SEED_USER_IDS.tom,
  SEED_USER_IDS.sara,
];

/* ------------------------------------------------------------------ events */

export function createSeedEvents(): EventRecord[] {
  const stamp = { createdAt: daysAgo(21), updatedAt: daysAgo(3) };

  return [
    {
      ...stamp,
      id: SEED_EVENT_IDS.designCritique,
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
      organizerId: SEED_USER_IDS.daniel,
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.engAllHands,
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
      organizerId: SEED_USER_IDS.maya,
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.fridaySocial,
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
      organizerId: SEED_USER_IDS.sara,
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.leadershipOffsite,
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
      organizerId: SEED_USER_IDS.sara,
      coHostIds: [],
      invitedUserIds: [SEED_USER_IDS.maya, SEED_USER_IDS.daniel],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.compReview,
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
      organizerId: SEED_USER_IDS.sara,
      coHostIds: [],
      invitedUserIds: [SEED_USER_IDS.maya],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.tsWorkshop,
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
      organizerId: SEED_USER_IDS.maya,
      coHostIds: [SEED_USER_IDS.daniel],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.productReview,
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
      organizerId: SEED_USER_IDS.daniel,
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.oncallTraining,
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
      organizerId: SEED_USER_IDS.maya,
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.hackDay,
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
      organizerId: SEED_USER_IDS.maya,
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.postmortem,
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
      organizerId: SEED_USER_IDS.maya,
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.sprintRetro,
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
      organizerId: SEED_USER_IDS.daniel,
      coHostIds: [],
      invitedUserIds: [],
    },
    {
      ...stamp,
      id: SEED_EVENT_IDS.newHireBreakfast,
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
      organizerId: SEED_USER_IDS.sara,
      coHostIds: [],
      invitedUserIds: [],
    },
  ];
}

/* ----------------------------------------------------------- registrations */

/**
 * A registration fixture. It carries its own `id` -- the rows used to be
 * numbered from their array position, which made every id move whenever a row
 * was inserted above it.
 */
type SeedRegistration = Omit<Registration, "createdAt" | "updatedAt">;

export function createSeedRegistrations(): Registration[] {
  const rows: SeedRegistration[] = [
    // Approval event: one confirmed, one still waiting, one turned down.
    {
      id: "dfed86db-c7d3-4dfc-98e2-471520ef98cc",
      eventId: SEED_EVENT_IDS.designCritique,
      userId: SEED_USER_IDS.maya,
      status: "going",
    },
    {
      id: "e9312f02-9430-45da-80ec-531f49cf4545",
      eventId: SEED_EVENT_IDS.designCritique,
      userId: SEED_USER_IDS.priya,
      status: "pending",
      message: "I own the activation metric for this flow — would like to be in the room.",
    },
    {
      id: "2f6f57d8-c30e-4155-8faa-0c430d161f31",
      eventId: SEED_EVENT_IDS.designCritique,
      userId: SEED_USER_IDS.tom,
      status: "rejected",
      decidedBy: SEED_USER_IDS.daniel,
      decidedAt: daysAgo(2),
    },

    // Open event, no capacity: everyone piles in.
    {
      id: "3140a8fd-fba8-42d4-ad6f-7787679b4092",
      eventId: SEED_EVENT_IDS.engAllHands,
      userId: SEED_USER_IDS.priya,
      status: "going",
    },
    {
      id: "ef865907-0f8e-46a8-ad9a-3b872a1873cb",
      eventId: SEED_EVENT_IDS.engAllHands,
      userId: SEED_USER_IDS.tom,
      status: "going",
    },
    {
      id: "8eaea73b-5a92-493d-820d-c208492b776a",
      eventId: SEED_EVENT_IDS.engAllHands,
      userId: SEED_USER_IDS.daniel,
      status: "going",
    },
    {
      id: "bc47c028-4dc1-4753-a097-1069581e0345",
      eventId: SEED_EVENT_IDS.engAllHands,
      userId: SEED_USER_IDS.sara,
      status: "going",
    },

    // Open event with room to spare, plus someone who dropped out.
    {
      id: "8a742b2c-db5e-44f5-ac1c-b572e0ec6529",
      eventId: SEED_EVENT_IDS.fridaySocial,
      userId: SEED_USER_IDS.maya,
      status: "going",
    },
    {
      id: "ffea5aa8-4655-4fcb-89d3-3fbf2863797d",
      eventId: SEED_EVENT_IDS.fridaySocial,
      userId: SEED_USER_IDS.daniel,
      status: "going",
    },
    {
      id: "03d320d8-53b5-41d7-8d48-dbd2919be4f2",
      eventId: SEED_EVENT_IDS.fridaySocial,
      userId: SEED_USER_IDS.priya,
      status: "going",
    },
    {
      id: "c7db2bcc-e07e-49a6-95ac-26191becef19",
      eventId: SEED_EVENT_IDS.fridaySocial,
      userId: SEED_USER_IDS.tom,
      status: "cancelled",
    },

    // Invite-only: only invited people are in here at all.
    {
      id: "33bfb100-84e5-4b9c-99b1-6c69232682a3",
      eventId: SEED_EVENT_IDS.leadershipOffsite,
      userId: SEED_USER_IDS.maya,
      status: "going",
    },
    {
      id: "48f68f9d-f979-4069-a8fe-d60277ff5eed",
      eventId: SEED_EVENT_IDS.compReview,
      userId: SEED_USER_IDS.maya,
      status: "going",
    },

    // Approval event with a request the current default persona can act on.
    {
      id: "74d30af9-24cf-488c-8ece-58e97a5b0fbc",
      eventId: SEED_EVENT_IDS.tsWorkshop,
      userId: SEED_USER_IDS.tom,
      status: "pending",
      message: "Mostly want the inference section — happy to take a spot on the waitlist.",
    },
    {
      id: "7bda6b81-f06b-4a37-9e01-237f79627c1b",
      eventId: SEED_EVENT_IDS.tsWorkshop,
      userId: SEED_USER_IDS.priya,
      status: "going",
    },

    {
      id: "43af4b08-079d-4b6c-aaf5-d7307f4a51e5",
      eventId: SEED_EVENT_IDS.productReview,
      userId: SEED_USER_IDS.priya,
      status: "going",
    },

    // Capacity 3 and three confirmed: this event is full.
    {
      id: "650bf708-5d19-4a5c-bb98-10895b941bb9",
      eventId: SEED_EVENT_IDS.oncallTraining,
      userId: SEED_USER_IDS.priya,
      status: "going",
    },
    {
      id: "dbc08177-8238-4084-b72f-e76702540b46",
      eventId: SEED_EVENT_IDS.oncallTraining,
      userId: SEED_USER_IDS.tom,
      status: "going",
    },
    {
      id: "fc843cf8-84b2-4a50-8fc3-d0b956e86463",
      eventId: SEED_EVENT_IDS.oncallTraining,
      userId: SEED_USER_IDS.daniel,
      status: "going",
    },

    // Cancelled event that still has people attached to it.
    {
      id: "551dcd6a-4edf-4f44-b3b5-634483b75d37",
      eventId: SEED_EVENT_IDS.postmortem,
      userId: SEED_USER_IDS.tom,
      status: "going",
    },
    {
      id: "5992bc10-09da-4a16-8260-0c0b42e97009",
      eventId: SEED_EVENT_IDS.postmortem,
      userId: SEED_USER_IDS.priya,
      status: "cancelled",
    },

    // Past events, so "my events" has some history to show.
    {
      id: "e9bc3546-40c6-4490-a651-d4bc93f3b87a",
      eventId: SEED_EVENT_IDS.sprintRetro,
      userId: SEED_USER_IDS.priya,
      status: "going",
    },
    {
      id: "fc36c27c-648a-4794-a44c-034449933880",
      eventId: SEED_EVENT_IDS.sprintRetro,
      userId: SEED_USER_IDS.tom,
      status: "going",
    },
    {
      id: "3542b8f4-0c99-4751-b8db-6f96728de06d",
      eventId: SEED_EVENT_IDS.sprintRetro,
      userId: SEED_USER_IDS.daniel,
      status: "going",
    },
    {
      id: "64b4d627-f572-4f2a-8206-9c07450b9cbf",
      eventId: SEED_EVENT_IDS.newHireBreakfast,
      userId: SEED_USER_IDS.maya,
      status: "going",
    },
    {
      id: "b2470460-f861-4b2b-a888-c630fb03d139",
      eventId: SEED_EVENT_IDS.newHireBreakfast,
      userId: SEED_USER_IDS.priya,
      status: "going",
    },
    {
      id: "58209b20-20fe-4718-aaee-ec97872757b0",
      eventId: SEED_EVENT_IDS.newHireBreakfast,
      userId: SEED_USER_IDS.tom,
      status: "going",
    },
  ];

  // Only the stamps are derived from the position; the ids are the rows' own.
  return rows.map((row, index) => ({
    ...row,
    createdAt: daysAgo(14 - (index % 12)),
    updatedAt: daysAgo(2),
  }));
}
