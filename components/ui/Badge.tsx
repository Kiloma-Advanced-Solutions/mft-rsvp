import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./Badge.module.css";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type BadgeVariant = "soft" | "outline" | "solid";

type BadgeProps = {
  children: ReactNode;
  tone?: BadgeTone;
  variant?: BadgeVariant;
  size?: "sm" | "lg";
  /** Leading status dot. Useful for lifecycle states. */
  dot?: boolean;
  className?: string;
};

export function Badge({
  children,
  tone = "neutral",
  variant = "soft",
  size = "sm",
  dot = false,
  className,
}: BadgeProps) {
  return (
    <span
      className={cx(
        styles.badge,
        styles[tone],
        variant !== "soft" && styles[variant],
        size === "lg" && styles.lg,
        className,
      )}
    >
      {dot && <span className={styles.dot} aria-hidden />}
      {children}
    </span>
  );
}
