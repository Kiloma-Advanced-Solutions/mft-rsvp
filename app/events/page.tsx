import Link from "next/link";

import { EventCard, EventGrid } from "@/components/events/EventCard";
import { EventFilters } from "@/components/events/EventFilters";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { hasActiveFilters, parseBoardFilters } from "@/lib/board-filters";
import { getBoard, type BoardEvent } from "@/lib/events";
import { BOARD_LABELS } from "@/lib/labels";
import { getCurrentUser } from "@/lib/session";

import styles from "./events.module.css";

export const metadata = {
  title: "Board",
};

/**
 * MILESTONE 1 — the board.
 *
 * A Server Component, which is what makes the visibility rule enforceable:
 * `getBoard()` decides what this person may see before anything is rendered, so
 * an invite-only event they were not invited to is never in the payload at all.
 *
 * Filters are read from the query string rather than held in state, so the
 * server does the filtering too and a filtered board can be linked to.
 */
export default async function BoardPage({ searchParams }: PageProps<"/events">) {
  const [viewer, params] = await Promise.all([getCurrentUser(), searchParams]);

  const filters = parseBoardFilters(params);
  const board = await getBoard(viewer, filters);

  const matchCount = board.upcoming.length + board.past.length;
  const filtered = hasActiveFilters(filters);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Board"
        description="Everything you can register for, and everything you host."
      />

      <EventFilters filters={filters} accessCounts={board.accessCounts} />

      {matchCount === 0 ? (
        <BoardEmptyState filtered={filtered} />
      ) : (
        <>
          {filtered && (
            <p className={styles.resultLine}>
              Showing {matchCount} of {board.visibleCount} events you can see.
            </p>
          )}

          <BoardSection
            title={BOARD_LABELS.upcoming}
            events={board.upcoming}
            emptyNote="Nothing coming up in this slice of the board."
          />

          {board.past.length > 0 && (
            <BoardSection title={BOARD_LABELS.past} events={board.past} muted />
          )}
        </>
      )}
    </div>
  );
}

/**
 * One titled block of cards. `muted` is what makes past events recede — the
 * cards dim themselves, this dims the heading that goes with them.
 */
function BoardSection({
  title,
  events,
  muted = false,
  emptyNote,
}: {
  title: string;
  events: BoardEvent[];
  muted?: boolean;
  /** Shown instead of a grid when this section alone has nothing in it. */
  emptyNote?: string;
}) {
  return (
    <section className={muted ? styles.sectionMuted : styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionCount}>{events.length}</span>
      </div>

      {events.length === 0 ? (
        <p className={styles.sectionNote}>{emptyNote}</p>
      ) : (
        <EventGrid>
          {events.map((row) => (
            <EventCard
              key={row.event.id}
              event={row.event}
              attendees={row.attendees}
              goingCount={row.goingCount}
              viewerStatus={row.viewerRegistration?.status}
              hostName={row.hosts[0]?.name}
            />
          ))}
        </EventGrid>
      )}
    </section>
  );
}

/**
 * Two different kinds of nothing. Filtering everything out is recoverable and
 * should say so; an empty board is not the person's fault and should explain
 * itself instead of looking broken.
 */
function BoardEmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <EmptyState
        icon="⌕"
        title="No events match these filters"
        description="Nothing on your board sits in that category and access mode together. Widen one of them to see more."
        actions={
          <Link href="/events" className={buttonClass({ variant: "secondary" })}>
            {BOARD_LABELS.clearFilters}
          </Link>
        }
      />
    );
  }

  return (
    <EmptyState
      icon="◳"
      title="Nothing on the board yet"
      description="There are no events you can see right now. Invite-only events stay hidden until a host adds you, and drafts are visible only to the people running them."
    />
  );
}
