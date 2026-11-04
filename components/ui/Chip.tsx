import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./Chip.module.css";

type CommonProps = {
  selected: boolean;
  dot?: boolean;
  className?: string;
  children: ReactNode;
};

type LinkProps = CommonProps & {
  href: string;
};

type RadioProps = CommonProps & {
  /** The form field the choice is submitted as. */
  name: string;
  value: string;
  onChange: (value: string) => void;
  /**
   * Draws the error border, for a field with an error. `aria-invalid` is the
   * row's to carry, on the `radiogroup` the chips sit in.
   */
  invalid?: boolean;
  /** The id of the hint or error the option is described by. */
  describedBy?: string;
};

/**
 * One option in a row of choices. Selected is navy, the rest are raised on the
 * surface. Two modes, one look, as `SegmentedControl` has:
 *
 * - **Link** (`href`): a filter chip whose state lives in the URL. It replaces
 *   the history entry, keeps the scroll position and marks the current choice
 *   with `aria-current`. Put a row of them in an element with `role="group"`
 *   and a name.
 * - **Radio** (`name`, `value`, `onChange`): a native radio input, visually
 *   hidden inside the chip, for a choice in a form. Give every chip in a row
 *   the same `name`; the browser gives the row its keyboard and submits the
 *   checked one. Make the row a `radiogroup` and put it in a `Field` with
 *   `group`, whose legend names it.
 *
 * `dot` adds a leading colour dot. Its colour is `--chip-dot`, set by the
 * caller on the chip or an ancestor -- the chip itself knows nothing about
 * what the colours mean.
 */
export function Chip(props: LinkProps | RadioProps) {
  const { selected, dot = false, className, children } = props;
  const dotMark = dot && <span className={styles.dot} aria-hidden />;

  if ("href" in props) {
    return (
      <Link
        href={props.href}
        replace
        scroll={false}
        aria-current={selected ? "true" : undefined}
        className={cx(styles.chip, selected && styles.selected, className)}
      >
        {dotMark}
        {children}
      </Link>
    );
  }

  const { name, value, onChange, invalid, describedBy } = props;

  return (
    <label
      className={cx(
        styles.chip,
        styles.choice,
        selected && styles.selected,
        invalid && !selected && styles.invalid,
        className,
      )}
    >
      <input
        type="radio"
        className="srOnly"
        name={name}
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        aria-describedby={describedBy}
      />
      {dotMark}
      {children}
    </label>
  );
}
