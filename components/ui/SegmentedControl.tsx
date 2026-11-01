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
  href: string;
  label: ReactNode;
  /** Whether this option is the one the current URL shows. */
  current: boolean;
  count?: number;
};

type CommonProps = {
  /** Describes the group for screen readers, e.g. "View mode". */
  label: string;
  fullWidth?: boolean;
  className?: string;
};

type RadioProps<T extends string> = CommonProps & {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
};

type LinkProps = CommonProps & {
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
 * - **Radio** (`options`, `value`, `onChange`): a real radio group of
 *   buttons, for a choice held in client state. Generic over the value type,
 *   so `onChange` hands you back your own union rather than a bare string.
 *
 * The file has no `"use client"`: the link mode needs no client code, so a
 * Server Component can render it directly. The radio mode takes a handler, so
 * it can only be rendered from a Client Component, which makes it one.
 */
export function SegmentedControl<T extends string>(
  props: RadioProps<T> | LinkProps,
) {
  const { label, fullWidth = false, className } = props;
  const groupClass = cx(styles.group, fullWidth && styles.fullWidth, className);

  if ("links" in props) {
    return (
      <div className={groupClass} role="group" aria-label={label}>
        {props.links.map((link) => (
          <Link
            key={link.href}
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

  const { options, value, onChange } = props;

  return (
    <div className={groupClass} role="radiogroup" aria-label={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className={cx(styles.option, selected && styles.selected)}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count !== undefined && (
              <span className={styles.count}>{option.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
