"use client";

import { useMemo, useState } from "react";

import { EmptyState, SegmentedControl } from "@/components/ui";
import type { SegmentOption } from "@/components/ui";
import { isPast } from "@/lib/date";
import { ACCESS_LABELS, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/labels";
import type { EventAccess, EventCategory, EventWithContext } from "@/lib/types";

import { EventCard, EventGrid } from "./EventCard";
import styles from "./EventBoard.module.css";

const ACCESS_ORDER: EventAccess[] = ["open", "approval", "invite"];

type CategoryFilter = "all" | EventCategory;
type AccessFilter = "all" | EventAccess;

/**
 * The board's filtering and layout, on top of a list the server has already
 * cut down to what this viewer is allowed to see -- filtering it further here
 * is a UX affordance, not a second security boundary.
 */
export function EventBoard({ events }: { events: EventWithContext[] }) {
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [access, setAccess] = useState<AccessFilter>("all");

  const filtered = useMemo(
    () =>
      events.filter(({ event }) => {
        if (category !== "all" && event.category !== category) return false;
        if (access !== "all" && event.access !== access) return false;
        return true;
      }),
    [events, category, access],
  );

  const upcoming = useMemo(
    () =>
      filtered
        .filter(({ event }) => !isPast(event.startsAt))
        .sort((a, b) => a.event.startsAt.localeCompare(b.event.startsAt)),
    [filtered],
  );

  const past = useMemo(
    () =>
      filtered
        .filter(({ event }) => isPast(event.startsAt))
        .sort((a, b) => b.event.startsAt.localeCompare(a.event.startsAt)),
    [filtered],
  );

  const categoryOptions: Array<SegmentOption<CategoryFilter>> = [
    { value: "all", label: "All categories", count: events.length },
    ...CATEGORY_ORDER.map((value) => ({
      value,
      label: CATEGORY_LABELS[value],
      count: events.filter(({ event }) => event.category === value).length,
    })),
  ];

  const accessOptions: Array<SegmentOption<AccessFilter>> = [
    { value: "all", label: "All access", count: events.length },
    ...ACCESS_ORDER.map((value) => ({
      value,
      label: ACCESS_LABELS[value],
      count: events.filter(({ event }) => event.access === value).length,
    })),
  ];

  return (
    <div className={styles.board}>
      <div className={styles.filters}>
        <SegmentedControl
          label="Filter by category"
          options={categoryOptions}
          value={category}
          onChange={setCategory}
        />
        <SegmentedControl
          label="Filter by access mode"
          options={accessOptions}
          value={access}
          onChange={setAccess}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon="◳"
          title="No events match these filters"
          description="Try a different category or access mode."
        />
      ) : (
        <>
          <EventSection title="Upcoming" items={upcoming} />
          {past.length > 0 && <EventSection title="Past" items={past} />}
        </>
      )}
    </div>
  );
}

function EventSection({
  title,
  items,
}: {
  title: string;
  items: EventWithContext[];
}) {
  if (items.length === 0) return null;

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <EventGrid>
        {items.map(({ event, goingCount, hosts, viewerRegistration }) => (
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
