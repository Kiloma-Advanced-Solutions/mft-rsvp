import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./PageHeader.module.css";

/**
 * The top of a page: optional back link, an optional eyebrow, the title, a
 * description and the page-level actions. Every screen should use it so the
 * vertical rhythm stays the same across the app.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  backHref,
  backLabel = "Back",
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx(styles.header, className)}>
      {backHref && (
        <Link href={backHref} className={styles.back}>
          <span aria-hidden>←</span> {backLabel}
        </Link>
      )}

      <div className={styles.row}>
        <div className={styles.titleGroup}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.title}>{title}</h1>
          {description && <p className={styles.description}>{description}</p>}
        </div>

        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
