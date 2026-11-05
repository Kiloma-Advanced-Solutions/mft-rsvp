import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./SegmentedControl.module.css";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Small pill on the right of the label, e.g. a result count. */
  count?: number;
};

/** One option of a segmented control that navigates. */
export type SegmentLink = {
  /**
   * Identifies the option across renders. Not its `href`: that changes with
   * the rest of the URL, and a new key would replace the option's element.
   */
  value: string;
  href: string;
  label: ReactNode;
  /** Whether this option is the one the current URL shows. */
  current: boolean;
  count?: number;
};

type CommonProps = {
  fullWidth?: boolean;
  className?: string;
};

type RadioProps<T extends string> = CommonProps & {
  /** The form field the choice is submitted as. */
  name: string;
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Draws the error ring, for a field with an error. */
  invalid?: boolean;
  /** The id of the hint or error the options are described by. */
  describedBy?: string;
};

type LinkProps = CommonProps & {
  /** Describes the group for screen readers, e.g. "View mode". */
  label: string;
  links: SegmentLink[];
};

/**
 * Single-choice switch: list vs calendar, or a row of filter tabs. Two modes,
 * one look:
 *
 * - **Links** (`links`): each option is a link and the choice lives in the
 *   URL. For a choice that changes what a server-rendered page shows, such as
 *   a filter. The links replace the history entry rather than adding one and
 *   keep the scroll position, so trying several options is not a string of
 *   Back presses and the page does not jump. The current option is marked
 *   with `aria-current`; each option is an ordinary tab stop, as links are.
 * - **Radio** (`name`, `options`, `value`, `onChange`): native radio inputs,
 *   for a choice in a form. The browser gives them their keyboard -- one tab
 *   stop for the group, the arrow keys to move and choose, in the reading
 *   direction -- and submits the checked one under `name`, as a `<select>`
 *   would. The inputs are visually hidden inside their segments. Put it in a
 *   `Field` with `group`: that fieldset is the `radiogroup`, named by its
 *   legend and carrying `aria-invalid`, so the track here is only the look.
 *   Generic over the value type, so `onChange` hands you back your own union
 *   rather than a bare string.
 *
 * The file has no `"use client"`: the link mode needs no client code, so a
 * Server Component can render it directly. The radio mode takes a handler, so
 * it can only be rendered from a Client Component, which makes it one.
 */
export function SegmentedControl<T extends string>(
  props: RadioProps<T> | LinkProps,
) {
  const { fullWidth = false, className } = props;
  const groupClass = cx(styles.group, fullWidth && styles.fullWidth, className);

  if ("links" in props) {
    return (
      <div className={groupClass} role="group" aria-label={props.label}>
        {props.links.map((link) => (
          <Link
            key={link.value}
            href={link.href}
            replace
            scroll={false}
            aria-current={link.current ? "true" : undefined}
            className={cx(styles.option, link.current && styles.selected)}
          >
            {link.label}
            {link.count !== undefined && (
              <span className={styles.count}>{link.count}</span>
            )}
          </Link>
        ))}
      </div>
    );
  }

  const { name, options, value, onChange, invalid, describedBy } = props;

  return (
    <div className={cx(groupClass, invalid && styles.invalid)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cx(styles.option, styles.choice, selected && styles.selected)}
          >
            <input
              type="radio"
              className="srOnly"
              name={name}
              value={option.value}
              checked={selected}
              onChange={() => onChange(option.value)}
              aria-describedby={describedBy}
            />
            {option.label}
            {option.count !== undefined && (
              <span className={styles.count}>{option.count}</span>
            )}
          </label>
        );
      })}
    </div>
  );
}
