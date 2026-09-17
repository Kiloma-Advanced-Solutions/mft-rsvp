import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import { UI_LABELS } from "@/lib/labels";

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
  backLabel = UI_LABELS.back,
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
          <span aria-hidden>→</span> {backLabel}
        </Link>
      )}

      <div className={styles.row}>
        <div className={styles.titleGroup}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          {/*
            `dir="auto"` because a title is as often an event's own name as it
            is one of our labels. The document is RTL, and an RTL paragraph
            puts an English sentence's trailing full stop at the wrong end;
            letting the element take its direction from its first strong
            character is right for either language and costs nothing when the
            content is already Hebrew.
          */}
          <h1 className={styles.title} dir="auto">
            {title}
          </h1>
          {description && (
            <p className={styles.description} dir="auto">
              {description}
            </p>
          )}
        </div>

        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}
