import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./Chip.module.css";

/**
 * A filter chip that navigates: one option in a row of choices whose state
 * lives in the URL. Selected is navy, the rest are raised on the surface.
 *
 * Like `SegmentedControl`'s link mode, it replaces the history entry and keeps
 * the scroll position, and marks the current choice with `aria-current`. Put a
 * row of them in an element with `role="group"` and a name.
 *
 * `dot` adds a leading colour dot. Its colour is `--chip-dot`, set by the
 * caller on the chip or an ancestor -- the chip itself knows nothing about
 * what the colours mean.
 */
export function Chip({
  href,
  selected,
  dot = false,
  className,
  children,
}: {
  href: string;
  selected: boolean;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      replace
      scroll={false}
      aria-current={selected ? "true" : undefined}
      className={cx(styles.chip, selected && styles.selected, className)}
    >
      {dot && <span className={styles.dot} aria-hidden />}
      {children}
    </Link>
  );
}
