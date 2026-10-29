import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./Icon.module.css";

/*
  The interface's icons, drawn on a 24-unit grid with round strokes in
  `currentColor`, so an icon takes the colour of the text around it in either
  theme. Local SVG rather than an icon library: the set is small, and it grows
  only when a screen actually needs another icon.
*/
const SHAPES = {
  board: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />,
} satisfies Record<string, ReactNode>;

/**
 * Decorative by default: hidden from assistive technology, because the control
 * it sits in carries the name. Pass `label` only when the icon is the sole
 * thing conveying its meaning.
 */
export function Icon({
  name,
  size = "md",
  label,
  className,
}: {
  name: keyof typeof SHAPES;
  size?: "md" | "lg";
  label?: string;
  className?: string;
}) {
  return (
    <svg
      className={cx(styles.icon, styles[size], className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      {SHAPES[name]}
    </svg>
  );
}
