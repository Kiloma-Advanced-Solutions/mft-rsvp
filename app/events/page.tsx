import { EventCard, EventGrid } from "@/components/events/EventCard";
import { EmptyState, PageHeader } from "@/components/ui";
import { isPast } from "@/lib/date";
import { db } from "@/lib/db";
import { CATEGORY_ORDER } from "@/lib/labels";
import { getCurrentUser } from "@/lib/session";
import type { EventAccess, EventCategory, EventRecord, User } from "@/lib/types";
import { canSeeEvent } from "@/lib/visibility";

import { EventFilters, type AccessFilter, type CategoryFilter } from "./EventFilters";
import styles from "./page.module.css";

export const metadata = {
  title: "Board",
};

const ACCESS_VALUES: EventAccess[] = ["open", "approval", "invite"];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * `/events` -- the events this person is allowed to see, filtered further by
 * whatever category/access mode they picked. Visibility itself is decided
 * once, by `canSeeEvent`, and nowhere else -- the same function backs
 * `GET /api/events`, so this page and the API can never disagree about what
 * leaks.
 */
export default async function BoardPage({ searchParams }: PageProps<"/events">) {
  const params = await searchParams;

  const categoryParam = firstParam(params.category);
  const category: CategoryFilter = CATEGORY_ORDER.includes(
    categoryParam as EventCategory,
  )
    ? (categoryParam as EventCategory)
    : "all";

  const accessParam = firstParam(params.access);
  const access: AccessFilter = ACCESS_VALUES.includes(accessParam as EventAccess)
    ? (accessParam as EventAccess)
    : "all";

  const [viewer, events, registrations, users] = await Promise.all([
    getCurrentUser(),
    db.events.list(),
    db.registrations.list(),
    db.users.list(),
  ]);

  const usersById = new Map(users.map((user) => [user.id, user]));

  const visible = events.filter((event) => canSeeEvent(viewer, event));
  const filtered = visible.filter(
    (event) =>
      (category === "all" || event.category === category) &&
      (access === "all" || event.access === access),
  );

  const upcoming = filtered
    .filter((event) => !isPast(event.startsAt))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = filtered
    .filter((event) => isPast(event.startsAt))
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt));

  function renderCard(event: EventRecord) {
    const eventRegistrations = registrations.filter(
      (registration) => registration.eventId === event.id,
    );
    const going = eventRegistrations.filter(
      (registration) => registration.status === "going",
    );
    const attendees = going
      .slice(0, 4)
      .map((registration) => usersById.get(registration.userId))
      .filter((user): user is User => Boolean(user));
    const viewerRegistration = eventRegistrations.find(
      (registration) => registration.userId === viewer.id,
    );
    const host = usersById.get(event.organizerId);

    return (
      <EventCard
        key={event.id}
        event={event}
        attendees={attendees}
        goingCount={going.length}
        viewerStatus={viewerRegistration?.status ?? null}
        hostName={host?.name}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="Board"
        description="Everything you can register for, and everything you host."
        actions={<EventFilters category={category} access={access} />}
      />

      {filtered.length === 0 ? (
        <EmptyState
          icon="◳"
          title="Nothing matches"
          description={
            visible.length === 0
              ? "There is nothing on the board for you yet. Check back once something is published."
              : "No events match these filters. Try widening them to see more of the board."
          }
        />
      ) : (
        <div className={styles.sections}>
          {upcoming.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>
                Upcoming <span className={styles.count}>{upcoming.length}</span>
              </h2>
              <EventGrid>{upcoming.map(renderCard)}</EventGrid>
            </section>
          )}

          {past.length > 0 && (
            <section>
              <h2 className={styles.sectionTitle}>
                Past <span className={styles.count}>{past.length}</span>
              </h2>
              <EventGrid>{past.map(renderCard)}</EventGrid>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
