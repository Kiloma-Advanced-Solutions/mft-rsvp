import { cx } from "@/lib/cx";

import styles from "./Spinner.module.css";

export function Spinner({
  size = "md",
  className,
}: {
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  return (
    <span
      className={cx(styles.spinner, styles[size], className)}
      role="status"
      aria-label="Loading"
    />
  );
}

/** Full-block loading state, for `loading.tsx` and Suspense fallbacks. */
export function LoadingBlock({ label = "Loading…" }: { label?: string }) {
  return (
    <div className={styles.centered}>
      <Spinner />
      <span>{label}</span>
    </div>
  );
}
