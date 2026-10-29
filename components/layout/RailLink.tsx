"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";

import { Icon } from "@/components/ui";

import styles from "./RailLink.module.css";

/**
 * One destination in the navigation rail: an icon over its name.
 *
 * The only client code in the frame's navigation, because the current page is
 * known from the URL in the browser. A destination is current on its own path
 * only -- the board is not current on an event's page, as the design has it.
 */
export function RailLink({
  href,
  icon,
  label,
}: {
  href: string;
  icon: ComponentProps<typeof Icon>["name"];
  label: string;
}) {
  const current = usePathname() === href;

  return (
    <Link
      href={href}
      className={styles.item}
      aria-current={current ? "page" : undefined}
    >
      <span className={styles.icon}>
        <Icon name={icon} size="lg" />
      </span>
      {label}
    </Link>
  );
}
