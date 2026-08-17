"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import {
  Field,
  SegmentedControl,
  Select,
  buttonClass,
  type SegmentOption,
} from "@/components/ui";
import {
  ACCESS_ORDER,
  boardHref,
  hasActiveFilters,
  type BoardFilters,
} from "@/lib/board-filters";
import { cx } from "@/lib/cx";
import {
  ACCESS_LABELS,
  BOARD_LABELS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/lib/labels";
import type { EventAccess } from "@/lib/types";

import styles from "./EventFilters.module.css";

/** The segmented control needs a value for "no filter"; the URL just omits it. */
const ANY = "any";

type AccessValue = EventAccess | typeof ANY;

/**
 * Category and access mode for the board.
 *
 * The only client component on this screen. It does not filter anything — it
 * navigates, and the server re-renders the board from the new query string.
 * That is what keeps events the viewer may not see out of the browser entirely.
 */
export function EventFilters({
  filters,
  accessCounts,
  className,
}: {
  filters: BoardFilters;
  /** Matches per mode within the chosen category, shown on each segment. */
  accessCounts: Record<EventAccess, number>;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function apply(next: BoardFilters) {
    startTransition(() => {
      router.push(boardHref(next), { scroll: false });
    });
  }

  const accessOptions: Array<SegmentOption<AccessValue>> = [
    {
      value: ANY,
      label: BOARD_LABELS.allAccess,
      count: ACCESS_ORDER.reduce((total, mode) => total + accessCounts[mode], 0),
    },
    ...ACCESS_ORDER.map((mode) => ({
      value: mode,
      label: ACCESS_LABELS[mode],
      count: accessCounts[mode],
    })),
  ];

  return (
    <div className={cx(styles.bar, className)} aria-busy={pending || undefined}>
      <Field label={BOARD_LABELS.category} className={styles.category}>
        <Select
          value={filters.category ?? ""}
          onChange={(event) =>
            apply({
              ...filters,
              category:
                CATEGORY_ORDER.find((value) => value === event.target.value) ??
                null,
            })
          }
        >
          <option value="">{BOARD_LABELS.allCategories}</option>
          {CATEGORY_ORDER.map((category) => (
            <option key={category} value={category}>
              {CATEGORY_LABELS[category]}
            </option>
          ))}
        </Select>
      </Field>

      <div className={styles.access}>
        <span className={styles.groupLabel}>{BOARD_LABELS.access}</span>
        <SegmentedControl<AccessValue>
          label={BOARD_LABELS.access}
          options={accessOptions}
          value={filters.access ?? ANY}
          onChange={(value) =>
            apply({ ...filters, access: value === ANY ? null : value })
          }
        />
      </div>

      {hasActiveFilters(filters) && (
        <Link
          href="/events"
          scroll={false}
          className={buttonClass({
            variant: "ghost",
            size: "sm",
            className: styles.clear,
          })}
        >
          {BOARD_LABELS.clearFilters}
        </Link>
      )}
    </div>
  );
}
