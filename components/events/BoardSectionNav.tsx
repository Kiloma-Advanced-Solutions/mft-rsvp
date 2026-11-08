import Link from "next/link";

import { FocusRestoringNav, SegmentIndicator } from "@/components/ui";
import { BOARD_SECTIONS, boardHref, sectionIntent } from "@/lib/board";
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
 * The `<nav>` is `FocusRestoringNav`, one of the board's two client pieces
 * (the other is the page's `QueuedNavigation`). A link in an empty state, or
 * the filters' clear link, can navigate to a board on which it no longer
 * exists; focus then comes here, to the current section, instead of being
 * dropped. Each link's `data-nav-intent` lets a held click on a vanished jump
 * link be replayed through the matching section link here.
 *
 * The navy bar under the current section is the segmented control's
 * `SegmentIndicator`, drawn as an underline, so it slides to a new section.
 * Its value is the section the server rendered, so it moves when the
 * navigation commits, with the section's cards -- never ahead of them. It is
 * presentation only; the links keep their own semantics.
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
      <SegmentIndicator value={state.section} className={styles.indicator} />
      {BOARD_SECTIONS.map((section) => {
        const current = section === state.section;
        return (
          <Link
            key={section}
            href={boardHref({ ...state, section })}
            replace
            scroll={false}
            aria-current={current ? "page" : undefined}
            data-nav-intent={sectionIntent(section)}
            data-segment={section}
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
