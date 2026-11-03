import Link from "next/link";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import { UI_LABELS } from "@/lib/labels";

import { Icon } from "./Icon";
import styles from "./PageHeader.module.css";

/** One step of a breadcrumb trail. The last step is the current page. */
export type Breadcrumb = {
  label: string;
  /** Where the step leads. Ignored on the last step, which is not a link. */
  href?: string;
};

/**
 * The top of a page: optional breadcrumbs or back link, an optional eyebrow,
 * the title, a description, a row of meta (badges, say) under it and the
 * page-level actions. Every screen should use it so the vertical rhythm stays
 * the same across the app.
 */
export function PageHeader({
  title,
  description,
  eyebrow,
  meta,
  actions,
  centerTitle = false,
  breadcrumbs,
  backHref,
  backLabel = UI_LABELS.back,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  /** Shown under the description, inside the title's column. */
  meta?: ReactNode;
  actions?: ReactNode;
  /**
   * Centres the title and the description under it on the whole header --
   * only those two; the eyebrow and the meta keep the start. The actions move
   * up to the eyebrow's line, at its end, so they never take width from the
   * title.
   */
  centerTitle?: boolean;
  /** Replaces the back link when given. */
  breadcrumbs?: Breadcrumb[];
  backHref?: string;
  backLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx(styles.header, className)}>
      {breadcrumbs ? (
        <Breadcrumbs steps={breadcrumbs} />
      ) : backHref && (
        <Link href={backHref} className={styles.back}>
          <span aria-hidden>→</span> {backLabel}
        </Link>
      )}

      <div className={cx(styles.row, centerTitle && styles.centered)}>
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
          {meta && <div className={styles.meta}>{meta}</div>}
        </div>

        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}

/**
 * Where this page sits, as links back up the trail. An ordered list inside a
 * named `<nav>`, the last step marked `aria-current="page"` and not a link.
 * A step's label can be an event's own title, so each takes its own direction
 * with `dir="auto"`, and the current one truncates rather than widening the
 * page. The separator is decorative.
 */
function Breadcrumbs({ steps }: { steps: Breadcrumb[] }) {
  const last = steps.length - 1;

  return (
    <nav aria-label={UI_LABELS.breadcrumbs} className={styles.breadcrumbs}>
      <ol className={styles.trail}>
        {steps.map((step, index) => (
          <li key={index} className={styles.step}>
            {index > 0 && (
              <Icon name="chevronLeft" size="sm" className={styles.separator} />
            )}
            {index === last || !step.href ? (
              <span
                className={styles.current}
                aria-current={index === last ? "page" : undefined}
                dir="auto"
                title={step.label}
              >
                {step.label}
              </span>
            ) : (
              <Link href={step.href} className={styles.crumb} dir="auto">
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
