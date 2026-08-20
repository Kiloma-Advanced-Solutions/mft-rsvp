"use client";

import { useRouter } from "next/navigation";

import { SegmentedControl } from "@/components/ui";
import { ACCESS_LABELS, CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/labels";
import type { EventAccess, EventCategory } from "@/lib/types";

import styles from "./EventFilters.module.css";

export type CategoryFilter = "all" | EventCategory;
export type AccessFilter = "all" | EventAccess;

const ACCESS_ORDER: EventAccess[] = ["open", "approval", "invite"];

/**
 * Category and access-mode filters for the board. The current values live in
 * the URL (`?category=&access=`) so the filtered view is a Server Component
 * render, not client state -- this is the one leaf that needs a click handler.
 */
export function EventFilters({
  category,
  access,
}: {
  category: CategoryFilter;
  access: AccessFilter;
}) {
  const router = useRouter();

  function navigate(next: { category: CategoryFilter; access: AccessFilter }) {
    const params = new URLSearchParams();
    if (next.category !== "all") params.set("category", next.category);
    if (next.access !== "all") params.set("access", next.access);

    const query = params.toString();
    router.push(query ? `/events?${query}` : "/events");
  }

  return (
    <div className={styles.filters}>
      <SegmentedControl<CategoryFilter>
        label="Filter by category"
        value={category}
        onChange={(value) => navigate({ category: value, access })}
        options={[
          { value: "all", label: "All categories" },
          ...CATEGORY_ORDER.map((value) => ({
            value,
            label: CATEGORY_LABELS[value],
          })),
        ]}
      />
      <SegmentedControl<AccessFilter>
        label="Filter by access mode"
        value={access}
        onChange={(value) => navigate({ category, access: value })}
        options={[
          { value: "all", label: "All access" },
          ...ACCESS_ORDER.map((value) => ({
            value,
            label: ACCESS_LABELS[value],
          })),
        ]}
      />
    </div>
  );
}
