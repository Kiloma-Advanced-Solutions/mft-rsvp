"use client";

import { useRouter } from "next/navigation";
import type { ChangeEvent } from "react";

import { Field, Select } from "@/components/ui";
import {
  ACCESS_LABELS,
  ACCESS_ORDER,
  BOARD_LABELS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/lib/labels";
import type { EventAccess, EventCategory } from "@/lib/types";

import styles from "./BoardFilters.module.css";

/**
 * The board's filters. The only client code on the page.
 *
 * It owns no state: the filters live in the URL and the server does the
 * filtering, so this component's whole job is to turn a choice into a
 * navigation. `null` means "no filter" and is represented by the parameter
 * being absent from the query string.
 */

/** Absent from the query string, and the empty option in the picker. */
export type CategoryFilter = EventCategory | null;
export type AccessFilter = EventAccess | null;

export function BoardFilters({
  category,
  access,
}: {
  category: CategoryFilter;
  access: AccessFilter;
}) {
  const router = useRouter();

  /**
   * Both filters are read off the form, not off the props, because the props
   * are one render behind until the server responds. Changing the second
   * filter while the first is still in flight would otherwise navigate with a
   * stale value and silently drop the filter the person just set.
   */
  function navigate(event: ChangeEvent<HTMLSelectElement>) {
    const form = event.currentTarget.form;
    if (!form) return;

    const values = new FormData(form);
    const params = new URLSearchParams();
    for (const name of ["category", "access"]) {
      const value = values.get(name);
      if (typeof value === "string" && value) params.set(name, value);
    }

    const query = params.toString();
    // `replace`, not `push`: trying four filter combinations should not mean
    // pressing Back four times to leave the board.
    router.replace(query ? `/events?${query}` : "/events", { scroll: false });
  }

  return (
    <form
      className={styles.filters}
      // The form exists to group the two pickers so their live values can be
      // read together. Navigation happens on change; there is nothing to post.
      onSubmit={(event) => event.preventDefault()}
    >
      <Field label={BOARD_LABELS.categoryFilter} className={styles.filter}>
        <Select
          name="category"
          // Uncontrolled, keyed by the value the server rendered. The choice
          // stays put while the new page is fetched, and a reset from
          // elsewhere — the clear link, the Back button — remounts the picker
          // so it cannot drift from the URL.
          key={category ?? ""}
          defaultValue={category ?? ""}
          onChange={navigate}
        >
          <option value="">{BOARD_LABELS.allCategories}</option>
          {CATEGORY_ORDER.map((value) => (
            <option key={value} value={value}>
              {CATEGORY_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>

      <Field label={BOARD_LABELS.accessFilter} className={styles.filter}>
        <Select
          name="access"
          key={access ?? ""}
          defaultValue={access ?? ""}
          onChange={navigate}
        >
          <option value="">{BOARD_LABELS.allAccessModes}</option>
          {ACCESS_ORDER.map((value) => (
            <option key={value} value={value}>
              {ACCESS_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
    </form>
  );
}
