import Link from "next/link";

import { BoardFilters } from "@/components/events/BoardFilters";
import { BoardSectionNav } from "@/components/events/BoardSectionNav";
import { EventCard, EventGrid } from "@/components/events/EventCard";
import { EmptyState, Icon, PageHeader, buttonClass } from "@/components/ui";
import {
  BOARD_SECTIONS,
  boardHref,
  parseAccess,
  parseCategory,
  parseSection,
} from "@/lib/board";
import type { BoardSection, BoardState } from "@/lib/board";
import { isPast } from "@/lib/date";
import { getVisibleEventsWithContext } from "@/lib/events";
import {
  BOARD_LABELS,
  BOARD_SECTION_LABELS,
  MANAGE_LABELS,
  eventCountLabel,
  sectionJumpLabel,
} from "@/lib/labels";
import { canCreateEvent } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { EventWithContext } from "@/lib/types";

export const metadata = {
  /*
    `absolute` opts this page out of the root layout's "%s · לוח האירועים"
    template. The board's heading and the product's name are the same words, so
    the template would have the tab read them twice.
  */
  title: { absolute: BOARD_LABELS.title },
};

/** Ties the section's list to its heading, which only screen readers see. */
const SECTION_HEADING_ID = "board-section-heading";

/**
 * The board.
 *
 * A Server Component throughout: it resolves the viewer through
 * `getCurrentUser()`, asks `lib/events.ts` for the events that viewer is
 * allowed to see, and only then filters them and sorts them into sections.
 * Nothing the viewer may not see is ever rendered -- not a card, not a count
 * -- so nothing can be revealed by editing the query string or the DOM.
 *
 * The filters and the section live in the URL and are applied here, over the
 * already-authorised set. The filters and the section navigation are links to
 * the URLs of other board states, which `lib/board.ts` reads and writes, so no
 * board data and no filtering reach client code. The one client piece is the
 * section navigation's `<nav>`, which only restores keyboard focus when a
 * navigation removes the link that had it -- see `BoardSectionNav`.
 */
export default async function BoardPage({ searchParams }: PageProps<"/events">) {
  const [viewer, query] = await Promise.all([getCurrentUser(), searchParams]);
  const visible = await getVisibleEventsWithContext(viewer);

  const state: BoardState = {
    category: parseCategory(query.category),
    access: parseAccess(query.access),
    section: parseSection(query.section),
  };
  const { category, access, section } = state;
  const filtering = category !== null || access !== null;

  const matching = visible.filter(
    ({ event }) =>
      (category === null || event.category === category) &&
      (access === null || event.access === access),
  );

  // A cancelled event gets its own section rather than sitting among the ones
  // that are still going to happen or did happen. Grouping only: every
  // cancelled event the viewer may see is still here, and in one section.
  const active = matching.filter(({ event }) => event.status !== "cancelled");
  const cancelled = matching.filter(({ event }) => event.status === "cancelled");

  // `isPast` reads the start, which is also what marks a card as past and what
  // closes registration — one boundary, used consistently.
  const sections: Record<BoardSection, EventWithContext[]> = {
    upcoming: upcomingSoonestFirst(active),
    // The two orders, one after the other: a cancellation that was still to
    // come is the one someone might have been planning around.
    cancelled: [
      ...upcomingSoonestFirst(cancelled),
      ...startedMostRecentFirst(cancelled),
    ],
    past: startedMostRecentFirst(active),
  };
  const counts: Record<BoardSection, number> = {
    upcoming: sections.upcoming.length,
    cancelled: sections.cancelled.length,
    past: sections.past.length,
  };
  const items = sections[section];

  return (
    <div>
      <PageHeader
        title={BOARD_LABELS.title}
        description={eventCountLabel(matching.length, visible.length)}
        actions={
          /*
            Only whoever may actually create one. The link is an affordance:
            `/events/new` and `POST /api/events` both authorise from the session
            on their own.
          */
          canCreateEvent(viewer) ? (
            <Link
              href="/events/new"
              className={buttonClass({ variant: "primary", size: "lg" })}
            >
              <Icon name="plus" />
              {MANAGE_LABELS.create}
            </Link>
          ) : undefined
        }
      />

      <BoardFilters state={state} />

      <BoardSectionNav state={state} counts={counts} />

      <section aria-labelledby={SECTION_HEADING_ID}>
        <h2 id={SECTION_HEADING_ID} className="srOnly">
          {BOARD_SECTION_LABELS[section].heading}
        </h2>

        {matching.length === 0 ? (
          <BoardEmptyState state={state} filtering={filtering} />
        ) : items.length === 0 ? (
          <SectionEmptyState
            state={state}
            filtering={filtering}
            counts={counts}
          />
        ) : (
          <EventGrid>
            {items.map(({ event, hosts, goingCount, viewerRegistration }) => (
              <EventCard
                key={event.id}
                event={event}
                goingCount={goingCount}
                viewerStatus={viewerRegistration?.status ?? null}
                hostName={hosts[0]?.name}
              />
            ))}
          </EventGrid>
        )}
      </section>
    </div>
  );
}

/** Events that have not started yet, soonest first. */
function upcomingSoonestFirst(items: EventWithContext[]): EventWithContext[] {
  return items
    .filter(({ event }) => !isPast(event.startsAt))
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
}

/** Events that have started, most recent first. */
function startedMostRecentFirst(items: EventWithContext[]): EventWithContext[] {
  return items
    .filter(({ event }) => isPast(event.startsAt))
    .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));
}

/** A link styled as a small button, to another state of the board. */
function BoardLink({
  href,
  variant,
  children,
}: {
  href: string;
  variant: "secondary" | "ghost";
  children: string;
}) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      className={buttonClass({ variant, size: "sm" })}
    >
      {children}
    </Link>
  );
}

/**
 * Nothing on the board at all, in any section. Two different dead ends, and
 * only one of them is the viewer's to fix: the filters exclude everything, or
 * there is nothing this viewer may see.
 */
function BoardEmptyState({
  state,
  filtering,
}: {
  state: BoardState;
  filtering: boolean;
}) {
  if (filtering) {
    return (
      <EmptyState
        title={BOARD_LABELS.noMatchesTitle}
        description={BOARD_LABELS.noMatchesDescription}
        actions={
          <Link
            href={boardHref({ ...state, category: null, access: null })}
            replace
            scroll={false}
            className={buttonClass({ variant: "secondary" })}
          >
            {BOARD_LABELS.clearFilters}
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState
      title={BOARD_LABELS.emptyTitle}
      description={BOARD_LABELS.emptyDescription}
    />
  );
}

/**
 * The selected section is empty while another is not. Under filters, the
 * matches are elsewhere: offer each section that has some, with how many, and
 * clearing the filters. Without filters, this section simply has nothing in
 * it; from cancelled or past, offer the way back to upcoming if anything is
 * there. Every offer is a section with matching events -- never one that
 * would lead to another empty page.
 */
function SectionEmptyState({
  state,
  filtering,
  counts,
}: {
  state: BoardState;
  filtering: boolean;
  counts: Record<BoardSection, number>;
}) {
  const labels = BOARD_SECTION_LABELS[state.section];

  if (filtering) {
    const others = BOARD_SECTIONS.filter(
      (other) => other !== state.section && counts[other] > 0,
    );
    return (
      <EmptyState
        title={labels.filteredEmptyTitle}
        description={BOARD_LABELS.otherSectionsMatch}
        actions={
          <>
            {others.map((other) => (
              <BoardLink
                key={other}
                href={boardHref({ ...state, section: other })}
                variant="secondary"
              >
                {sectionJumpLabel(other, counts[other])}
              </BoardLink>
            ))}
            <BoardLink
              href={boardHref({ ...state, category: null, access: null })}
              variant="ghost"
            >
              {BOARD_LABELS.clearFilters}
            </BoardLink>
          </>
        }
      />
    );
  }

  const offersUpcoming = state.section !== "upcoming" && counts.upcoming > 0;
  return (
    <EmptyState
      title={labels.emptyTitle}
      description={labels.emptyDescription}
      actions={
        offersUpcoming ? (
          <BoardLink
            href={boardHref({ ...state, section: "upcoming" })}
            variant="secondary"
          >
            {BOARD_LABELS.toUpcoming}
          </BoardLink>
        ) : undefined
      }
    />
  );
}
