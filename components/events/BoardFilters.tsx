import Link from "next/link";

import { Chip, Icon, SegmentedControl } from "@/components/ui";
import type { SegmentLink } from "@/components/ui";
import { boardHref } from "@/lib/board";
import type { BoardState } from "@/lib/board";
import { cx } from "@/lib/cx";
import {
  ACCESS_LABELS,
  ACCESS_ORDER,
  BOARD_LABELS,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
} from "@/lib/labels";

import { ACCESS_ICONS, categoryToneClass } from "./EventMeta";
import styles from "./BoardFilters.module.css";

/**
 * The board's filters: access as a segmented control, category as chips, and
 * the clear link while either is set.
 *
 * A Server Component made of links. The filters live in the URL and the page
 * filters on the server, so choosing one is a navigation to the URL of the
 * new state and nothing here holds state or runs in the browser. Every link
 * is built from the whole current state with `boardHref`, so changing one
 * filter keeps the other one and the board's section, and clearing the
 * filters keeps the section too.
 */
export function BoardFilters({ state }: { state: BoardState }) {
  const { category, access } = state;
  const filtering = category !== null || access !== null;

  const accessLinks: SegmentLink[] = [
    {
      href: boardHref({ ...state, access: null }),
      label: BOARD_LABELS.allAccess,
      current: access === null,
    },
    ...ACCESS_ORDER.map((value) => ({
      href: boardHref({ ...state, access: value }),
      label: (
        <>
          <Icon name={ACCESS_ICONS[value]} size="sm" />
          {ACCESS_LABELS[value]}
        </>
      ),
      current: access === value,
    })),
  ];

  return (
    <div className={styles.filters}>
      <div className={styles.row}>
        <span className={styles.label} aria-hidden>
          {BOARD_LABELS.accessFilter}
        </span>
        <SegmentedControl
          label={BOARD_LABELS.accessFilter}
          links={accessLinks}
          className={styles.access}
        />
      </div>

      <div className={styles.row}>
        <span className={styles.label} aria-hidden>
          {BOARD_LABELS.categoryFilter}
        </span>
        <div
          className={styles.chips}
          role="group"
          aria-label={BOARD_LABELS.categoryFilter}
        >
          <Chip
            href={boardHref({ ...state, category: null })}
            selected={category === null}
          >
            {BOARD_LABELS.allCategories}
          </Chip>
          {CATEGORY_ORDER.map((value) => (
            <Chip
              key={value}
              href={boardHref({ ...state, category: value })}
              selected={category === value}
              dot
              className={cx(styles.categoryChip, categoryToneClass(value))}
            >
              {CATEGORY_LABELS[value]}
            </Chip>
          ))}
        </div>

        {filtering && (
          <Link
            href={boardHref({ ...state, category: null, access: null })}
            replace
            scroll={false}
            className={styles.clear}
          >
            {BOARD_LABELS.clearFilters}
          </Link>
        )}
      </div>
    </div>
  );
}
