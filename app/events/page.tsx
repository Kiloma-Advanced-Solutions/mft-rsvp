import { EventCard, EventGrid } from "@/components/events/EventCard";
import { EventFilterBar } from "@/components/events/EventFilterBar";
import { EmptyState, PageHeader } from "@/components/ui";
import { isPast } from "@/lib/date";
import { listVisibleEventsWithContext } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";
import { CATEGORY_ORDER } from "@/lib/labels";
import type { EventAccess, EventCategory } from "@/lib/types";

import styles from "./page.module.css";

export const metadata = {
  title: "Board",
};

function readCategory(value: string | string[] | undefined): EventCategory | "all" {
  const candidate = Array.isArray(value) ? value[0] : value;
  return CATEGORY_ORDER.includes(candidate as EventCategory)
    ? (candidate as EventCategory)
    : "all";
}

function readAccess(value: string | string[] | undefined): EventAccess | "all" {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate === "open" || candidate === "approval" || candidate === "invite"
    ? candidate
    : "all";
}

export default async function BoardPage({
  searchParams,
}: PageProps<"/events">) {
  const params = await searchParams;
  const category = readCategory(params.category);
  const access = readAccess(params.access);

  const viewer = await getCurrentUser();
  const events = await listVisibleEventsWithContext(viewer);

  const filtered = events.filter(({ event }) => {
    if (category !== "all" && event.category !== category) return false;
    if (access !== "all" && event.access !== access) return false;
    return true;
  });

  const upcoming = filtered
    .filter(({ event }) => !isPast(event.startsAt))
    .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt));

  const past = filtered
    .filter(({ event }) => isPast(event.startsAt))
    .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt));

  return (
    <div>
      <PageHeader
        title="Board"
        description="Everything you can register for, and everything you host."
      />

      <EventFilterBar category={category} access={access} />

      {filtered.length === 0 ? (
        <EmptyState
          icon="◳"
          title="No events match these filters"
          description="Try a different category or access mode."
        />
      ) : (
        <div className={styles.sections}>
          {upcoming.length > 0 && (
            <EventGrid>
              {upcoming.map(({ event, goingCount, hosts, viewerRegistration }) => (
                <EventCard
                  key={event.id}
                  event={event}
                  goingCount={goingCount}
                  viewerStatus={viewerRegistration?.status}
                  hostName={hosts[0]?.name}
                />
              ))}
            </EventGrid>
          )}

          {past.length > 0 && (
            <section>
              <h2 className={styles.pastHeading}>Past events</h2>
              <EventGrid>
                {past.map(({ event, goingCount, hosts, viewerRegistration }) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    goingCount={goingCount}
                    viewerStatus={viewerRegistration?.status}
                    hostName={hosts[0]?.name}
                  />
                ))}
              </EventGrid>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
