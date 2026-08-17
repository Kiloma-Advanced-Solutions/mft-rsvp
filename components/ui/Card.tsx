import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./Card.module.css";

type CardProps = {
  children: ReactNode;
  /** Padding applied to the card itself. Use `none` when using Card sections. */
  padding?: "none" | "sm" | "md" | "lg";
  elevation?: "flat" | "sm" | "md";
  /** Tinted background, for cards that sit on top of a white surface. */
  subtle?: boolean;
  /** Lifts on hover. Only use it when the whole card is a link or a button. */
  interactive?: boolean;
  className?: string;
};

export function Card({
  children,
  padding = "md",
  elevation = "sm",
  subtle = false,
  interactive = false,
  className,
}: CardProps) {
  const paddingClass = {
    none: styles.padNone,
    sm: styles.padSm,
    md: styles.padMd,
    lg: styles.padLg,
  }[padding];

  return (
    <div
      className={cx(
        styles.card,
        paddingClass,
        elevation === "flat" && styles.flat,
        elevation === "md" && styles.raised,
        subtle && styles.subtle,
        interactive && styles.interactive,
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Titled header strip. Pair with `<Card padding="none">`. */
export function CardHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div>
        <h2 className={styles.headerTitle}>{title}</h2>
        {description && <p className={styles.headerDescription}>{description}</p>}
      </div>
      {actions}
    </header>
  );
}

export function CardBody({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cx(styles.body, className)}>{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <footer className={styles.footer}>{children}</footer>;
}
