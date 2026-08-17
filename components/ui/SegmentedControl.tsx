"use client";

import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./SegmentedControl.module.css";

export type SegmentOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** Small pill on the right of the label, e.g. a result count. */
  count?: number;
};

/**
 * Single-choice switch: list vs calendar, or a row of filter tabs.
 *
 * Rendered as a real radio group so arrow keys work and screen readers
 * announce it correctly. Generic over the value type, so `onChange` hands you
 * back your own union rather than a bare string.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  fullWidth = false,
  className,
}: {
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Describes the group for screen readers, e.g. "View mode". */
  label: string;
  fullWidth?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cx(styles.group, fullWidth && styles.fullWidth, className)}
      role="radiogroup"
      aria-label={label}
    >
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
