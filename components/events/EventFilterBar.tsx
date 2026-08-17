"use client";

import { useRouter, useSearchParams } from "next/navigation";

import { Select } from "@/components/ui";
import { SegmentedControl } from "@/components/ui";
import { CATEGORY_LABELS, CATEGORY_ORDER, ACCESS_LABELS } from "@/lib/labels";
import type { EventAccess, EventCategory } from "@/lib/types";

import styles from "./EventFilterBar.module.css";

const ACCESS_OPTIONS: Array<{ value: EventAccess | "all"; label: string }> = [
  { value: "all", label: "All" },
  { value: "open", label: ACCESS_LABELS.open },
  { value: "approval", label: ACCESS_LABELS.approval },
  { value: "invite", label: ACCESS_LABELS.invite },
];

/**
 * Category and access filters, both stored in the URL so the board's filtered
 * state is shareable and survives a refresh. The page itself stays a Server
 * Component reading `searchParams` — this is the only client boundary.
 */
export function EventFilterBar({
  category,
  access,
}: {
  category: EventCategory | "all";
  access: EventAccess | "all";
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`/events${params.toString() ? `?${params.toString()}` : ""}`);
  }

  return (
    <div className={styles.bar}>
      <SegmentedControl
        label="Access"
        value={access}
        onChange={(value) => setParam("access", value)}
        options={ACCESS_OPTIONS}
      />

      <Select
        aria-label="Category"
        value={category}
        onChange={(event) => setParam("category", event.target.value)}
        className={styles.select}
      >
        <option value="all">All categories</option>
        {CATEGORY_ORDER.map((value) => (
          <option key={value} value={value}>
            {CATEGORY_LABELS[value]}
          </option>
        ))}
      </Select>
    </div>
  );
}
