import Link from "next/link";

import { FocusRestoringNav } from "@/components/ui";
import { BOARD_SECTIONS, boardHref } from "@/lib/board";
import type { BoardSection, BoardState } from "@/lib/board";
import { cx } from "@/lib/cx";
import { BOARD_LABELS, BOARD_SECTION_LABELS } from "@/lib/labels";

import styles from "./BoardSectionNav.module.css";

/**
 * The board's sections -- upcoming, cancelled, past -- each with how many of
 * its events pass the current filters. All three are always shown, a zero
 * included, so the board's shape does not change under a filter.
 *
 * Links, not an ARIA tab widget: choosing a section navigates to its URL, and
 * the server renders that section alone. The current one carries
 * `aria-current="page"`. Each link keeps the filters, and replaces the history
 * entry without scrolling, the same as the filters themselves.
 *
 * The counts are the caller's, computed on the server over the events this
 * viewer may see, so no count can reveal an event they cannot.
 *
 * The `<nav>` is `FocusRestoringNav`, the board's one piece of client code. A
 * link in an empty state, or the filters' clear link, can navigate to a board
 * on which it no longer exists; focus then comes here, to the current
 * section, instead of being dropped.
 */
export function BoardSectionNav({
  state,
  counts,
}: {
  state: BoardState;
  counts: Record<BoardSection, number>;
}) {
  return (
    <FocusRestoringNav
      location={boardHref(state)}
      label={BOARD_LABELS.sectionNav}
      className={styles.nav}
    >
      {BOARD_SECTIONS.map((section) => {
        const current = section === state.section;
        return (
          <Link
            key={section}
            href={boardHref({ ...state, section })}
            replace
            scroll={false}
            aria-current={current ? "page" : undefined}
            className={cx(styles.link, current && styles.current)}
          >
            {/*
              The space keeps the accessible name "קרובים 17" rather than
              "קרובים17"; in the flex row it takes no room.
            */}
            {BOARD_SECTION_LABELS[section].name}{" "}
            <span className={styles.count}>{counts[section]}</span>
          </Link>
        );
      })}
    </FocusRestoringNav>
  );
}
