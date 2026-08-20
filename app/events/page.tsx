import type { Metadata } from "next";
import Link from "next/link";

import { EventCard, EventGrid } from "@/components/events/EventCard";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { db } from "@/lib/db";
import { isPast } from "@/lib/date";
import { CATEGORY_ORDER } from "@/lib/labels";
import { getCurrentUser } from "@/lib/session";
import type {
  EventAccess,
  EventCategory,
  EventRecord,
  Registration,
  RegistrationStatus,
  User,
} from "@/lib/types";
import { listVisibleEvents } from "@/lib/visibility";

import { BoardFilters } from "./BoardFilters";
import styles from "./events.module.css";

export const metadata: Metadata = {
  title: "Board",
};

/** How many faces fit in a card's avatar stack before it collapses to "+n". */
const AVATAR_LIMIT = 4;

/**
 * The board.
 *
 * A Server Component on purpose: it reads the session and the store directly,
 * asks `lib/visibility.ts` which events this person may see, and applies the
 * category and access filters — all before any HTML exists. An event the viewer
 * is not allowed to see is never in the payload, so there is nothing for the
 * browser to leak.
 *
 * `EventCard` renders what it is given and derives nothing, so working out the
 * confirmed headcount, the attendee faces and the viewer's own status is this
 * page's job.
 */
export default async function BoardPage({ searchParams }: PageProps<"/events">) {
  const [user, query] = await Promise.all([getCurrentUser(), searchParams]);

  const category = parseCategory(firstValue(query.category));
  const access = parseAccess(firstValue(query.access));

  const [visible, registrations, users] = await Promise.all([
    listVisibleEvents(user),
    db.registrations.list(),
    db.users.list(),
  ]);

  const matching = visible.filter(
    (event) =>
      (category === null || event.category === category) &&
      (access === null || event.access === access),
  );

  const cards = matching.map((event) =>
    toCard(event, user, registrations, users),
  );

  const upcoming = cards
    .filter((card) => !isPast(card.event.startsAt))
    .sort((a, b) => compareStart(a.event, b.event));

  const past = cards
    .filter((card) => isPast(card.event.startsAt))
    .sort((a, b) => compareStart(b.event, a.event));

  const filtered = category !== null || access !== null;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Board"
        description={boardDescription(
          visible.length,
          visible.filter((event) => !isPast(event.startsAt)).length,
        )}
      />

      <BoardFilters category={category} access={access} />

      {visible.length === 0 ? (
        <EmptyState
          icon="◳"
          title="Nothing on the board yet"
          description="No published events are open to you right now. Invite-only events stay hidden until you are invited, and drafts are visible only to their hosts."
        />
      ) : cards.length === 0 ? (
        <EmptyState
          icon="⌕"
          title="No events match these filters"
          description={`You can see ${countLabel(visible.length, "event")}, but none of them are in this category and access mode. Try widening one of the two.`}
          actions={
            <Link href="/events" className={buttonClass({ variant: "secondary" })}>
              Clear filters
            </Link>
          }
        />
      ) : (
        <>
          <section className={styles.section} aria-labelledby="upcoming-heading">
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle} id="upcoming-heading">
                Coming up
              </h2>
              <span className={styles.sectionCount}>
                {countLabel(upcoming.length, "event")}
              </span>
            </div>

            {upcoming.length === 0 ? (
              <EmptyState
                compact
                title="Nothing coming up"
                description={
                  filtered
                    ? "Everything matching these filters has already happened."
                    : "Every event you can see is in the past."
                }
              />
            ) : (
              <EventGrid>
                {upcoming.map((card) => (
                  <BoardCard key={card.event.id} card={card} />
                ))}
              </EventGrid>
            )}
          </section>

          {past.length > 0 && (
            <section
              className={styles.pastSection}
              aria-labelledby="past-heading"
            >
              <div className={styles.sectionHead}>
                <h2 className={styles.pastTitle} id="past-heading">
                  Already happened
                </h2>
                <span className={styles.sectionCount}>
                  {countLabel(past.length, "event")}
                </span>
              </div>

              <EventGrid>
                {past.map((card) => (
                  <BoardCard key={card.event.id} card={card} />
                ))}
              </EventGrid>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- one card */

/** Everything `EventCard` needs that is not already on the event record. */
type BoardCardData = {
  event: EventRecord;
  goingCount: number;
  attendees: Array<Pick<User, "id" | "name" | "initials" | "accent">>;
  viewerStatus: RegistrationStatus | null;
  /** Only used when there are no attendee faces to show instead. */
  hostName?: string;
};

function BoardCard({ card }: { card: BoardCardData }) {
  return (
    <EventCard
      event={card.event}
      attendees={card.attendees}
      goingCount={card.goingCount}
      viewerStatus={card.viewerStatus}
      hostName={card.hostName}
    />
  );
}

function toCard(
  event: EventRecord,
  viewer: User,
  registrations: Registration[],
  users: User[],
): BoardCardData {
  const forEvent = registrations.filter((row) => row.eventId === event.id);

  // Only `going` counts towards attendance — pending, rejected and cancelled
  // rows are not attendees and must never reach the capacity maths.
  const going = forEvent
    .filter((row) => row.status === "going")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const attendees = going
    .slice(0, AVATAR_LIMIT)
    .map((row) => users.find((person) => person.id === row.userId))
    .filter((person): person is User => person !== undefined)
    .map(({ id, name, initials, accent }) => ({ id, name, initials, accent }));

  const viewerRegistration = forEvent.find((row) => row.userId === viewer.id);
  const host = users.find((person) => person.id === event.organizerId);

  return {
    event,
    goingCount: going.length,
    attendees,
    viewerStatus: viewerRegistration?.status ?? null,
    hostName: attendees.length === 0 ? host?.name : undefined,
  };
}

/* ---------------------------------------------------------------- helpers */

function compareStart(a: EventRecord, b: EventRecord): number {
  return a.startsAt.localeCompare(b.startsAt);
}

function countLabel(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * Describes what this person can see, not what the filters left behind — the
 * per-section counts do that. Mixing the two scopes in one sentence reads as a
 * bug ("12 events you can see · 0 coming up").
 */
function boardDescription(visibleCount: number, upcomingCount: number): string {
  if (visibleCount === 0) return "Nothing here is open to you yet.";
  return `${countLabel(visibleCount, "event")} you can see · ${upcomingCount} coming up.`;
}

/** A repeated query parameter is a malformed URL, not a multi-select. */
function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Anything unrecognised is treated as "no filter" rather than as an error. */
function parseCategory(value: string | undefined): EventCategory | null {
  return CATEGORY_ORDER.find((category) => category === value) ?? null;
}

function parseAccess(value: string | undefined): EventAccess | null {
  switch (value) {
    case "open":
    case "approval":
    case "invite":
      return value;
    default:
      return null;
  }
}
