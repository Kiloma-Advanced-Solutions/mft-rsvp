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
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.5 3.4 5.3 3.4 8.5s-1 6-3.4 8.5c-2.4-2.5-3.4-5.3-3.4-8.5s1-6 3.4-8.5z" />
    </>
  ),
  userCheck: (
    <>
      <circle cx="10" cy="8.5" r="3.4" />
      <path d="M4 19.5c.8-3.4 3.2-5.2 6-5.2 1.2 0 2.3.3 3.2.9" />
      <path d="M15 17.5l2 2 4-4.2" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof SHAPES;

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
  name: IconName;
  size?: "xs" | "sm" | "md" | "lg";
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
