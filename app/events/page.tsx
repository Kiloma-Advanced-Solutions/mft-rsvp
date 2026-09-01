import Link from "next/link";

import { BoardFilters } from "@/components/events/BoardFilters";
import type {
  AccessFilter,
  CategoryFilter,
} from "@/components/events/BoardFilters";
import { EventCard, EventGrid } from "@/components/events/EventCard";
import { EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { cx } from "@/lib/cx";
import { isPast } from "@/lib/date";
import { getVisibleEventsWithContext } from "@/lib/events";
import {
  ACCESS_ORDER,
  BOARD_LABELS,
  CATEGORY_ORDER,
  MANAGE_LABELS,
  eventCountLabel,
} from "@/lib/labels";
import { canCreateEvent } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { EventWithContext } from "@/lib/types";

import styles from "./events.module.css";

export const metadata = {
  title: BOARD_LABELS.title,
};

/**
 * The board.
 *
 * A Server Component throughout: it resolves the viewer through
 * `getCurrentUser()`, asks `lib/events.ts` for the events that viewer is
 * allowed to see, and only then filters, sorts and groups them. Nothing the
 * viewer may not see is ever rendered, so nothing can be revealed by editing
 * the query string or the DOM.
 *
 * Filters live in the URL and are applied here, over the already-authorised
 * set. `BoardFilters` is the one client leaf, and all it does is navigate.
 */
export default async function BoardPage({ searchParams }: PageProps<"/events">) {
  const [viewer, query] = await Promise.all([getCurrentUser(), searchParams]);
  const visible = await getVisibleEventsWithContext(viewer);

  const category = parseCategory(query.category);
  const access = parseAccess(query.access);
  const filtering = category !== null || access !== null;

  const matching = visible.filter(
    ({ event }) =>
      (category === null || event.category === category) &&
      (access === null || event.access === access),
  );

  // `isPast` reads the start, which is also what dims a card and what closes
  // registration — one boundary, used consistently.
  const upcoming = matching
    .filter(({ event }) => !isPast(event.startsAt))
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));
  const past = matching
    .filter(({ event }) => isPast(event.startsAt))
    .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));

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
              className={buttonClass({ variant: "primary" })}
            >
              {MANAGE_LABELS.create}
            </Link>
          ) : undefined
        }
      />

      <div className={styles.toolbar}>
        <BoardFilters category={category} access={access} />
        {filtering && (
          <Link href="/events" className={styles.clear}>
            {BOARD_LABELS.clearFilters}
          </Link>
        )}
      </div>

      {matching.length === 0 ? (
        <BoardEmptyState filtering={filtering} />
      ) : (
        <>
          <BoardSection title={BOARD_LABELS.upcoming} items={upcoming} />
          <BoardSection title={BOARD_LABELS.past} items={past} muted />
        </>
      )}
    </div>
  );
}

/**
 * One titled run of cards. Renders nothing when it is empty, so a board with no
 * history does not grow a lonely "Past" heading.
 */
function BoardSection({
  title,
  items,
  muted = false,
}: {
  title: string;
  items: EventWithContext[];
  muted?: boolean;
}) {
  if (items.length === 0) return null;

  return (
    <section className={cx(styles.section, muted && styles.sectionMuted)}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <span className={styles.sectionCount}>{items.length}</span>
      </div>

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
    </section>
  );
}

/** Two different dead ends, and only one of them is the viewer's to fix. */
function BoardEmptyState({ filtering }: { filtering: boolean }) {
  if (filtering) {
    return (
      <EmptyState
        icon="⌕"
        title={BOARD_LABELS.noMatchesTitle}
        description={BOARD_LABELS.noMatchesDescription}
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
      title={BOARD_LABELS.emptyTitle}
      description={BOARD_LABELS.emptyDescription}
    />
  );
}

/**
 * Query values are untrusted input. Anything that is not a known category or
 * access mode is treated as no filter at all, which is why these return the
 * union rather than casting a string into it.
 */
function parseCategory(value: string | string[] | undefined): CategoryFilter {
  return CATEGORY_ORDER.find((category) => category === value) ?? null;
}

function parseAccess(value: string | string[] | undefined): AccessFilter {
  return ACCESS_ORDER.find((access) => access === value) ?? null;
}
