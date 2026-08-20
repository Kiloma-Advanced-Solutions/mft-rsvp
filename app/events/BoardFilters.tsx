"use client";

import { useRouter } from "next/navigation";

import { Field, SegmentedControl, Select } from "@/components/ui";
import type { SegmentOption } from "@/components/ui";
import {
  ACCESS_LABELS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/lib/labels";
import type { EventAccess, EventCategory } from "@/lib/types";

import styles from "./events.module.css";

/**
 * The board's filter controls, and nothing else — this is the only client
 * boundary on the page.
 *
 * The filters live in the URL rather than in local state, which is what keeps
 * the board a Server Component: changing a filter is a navigation, the server
 * re-runs the visibility rules and sends back the events that survive them.
 * Nothing is filtered in the browser, and a filtered board can be linked to.
 *
 * The current values arrive as props instead of from `useSearchParams`, so this
 * component never suspends and the page needs no Suspense boundary around it.
 */

const BOARD_PATH = "/events";

/** An absent parameter means "no filter"; the empty string is its form value. */
const ANY = "";

const ACCESS_OPTIONS: Array<SegmentOption<EventAccess | typeof ANY>> = [
  { value: ANY, label: "Any" },
  { value: "open", label: ACCESS_LABELS.open },
  { value: "approval", label: ACCESS_LABELS.approval },
  { value: "invite", label: ACCESS_LABELS.invite },
];

export function BoardFilters({
  category,
  access,
}: {
  category: EventCategory | null;
  access: EventAccess | null;
}) {
  const router = useRouter();

  function apply(changed: { category?: string; access?: string }) {
    const params = new URLSearchParams();
    const nextCategory = changed.category ?? category ?? ANY;
    const nextAccess = changed.access ?? access ?? ANY;

    if (nextCategory) params.set("category", nextCategory);
    if (nextAccess) params.set("access", nextAccess);

    const query = params.toString();
    router.replace(query ? `${BOARD_PATH}?${query}` : BOARD_PATH, {
      scroll: false,
    });
  }

  return (
    <div className={styles.filters}>
      <Field label="Category" className={styles.filter}>
        <Select
          value={category ?? ANY}
          onChange={(event) => apply({ category: event.target.value })}
        >
          <option value={ANY}>Any category</option>
          {CATEGORY_ORDER.map((option) => (
            <option key={option} value={option}>
              {CATEGORY_LABELS[option]}
            </option>
          ))}
        </Select>
      </Field>

      <div className={styles.filter}>
        <span className={styles.filterLabel}>Access</span>
        <SegmentedControl
          label="Access mode"
          options={ACCESS_OPTIONS}
          value={access ?? ANY}
          onChange={(value) => apply({ access: value })}
        />
      </div>
    </div>
  );
}
