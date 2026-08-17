import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./EmptyState.module.css";

/**
 * Shown wherever a list has nothing in it. Always say why it is empty and what
 * the person can do next — "No events" on its own is a dead end.
 */
export function EmptyState({
  title,
  description,
  icon,
  actions,
  compact = false,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** A single glyph or small SVG. */
  icon?: ReactNode;
  actions?: ReactNode;
  compact?: boolean;
  className?: string;
}) {
  return (
    <div className={cx(styles.empty, compact && styles.compact, className)}>
      {icon && (
        <span className={styles.icon} aria-hidden>
          {icon}
        </span>
      )}
      <p className={styles.title}>{title}</p>
      {description && <p className={styles.description}>{description}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </div>
  );
}
