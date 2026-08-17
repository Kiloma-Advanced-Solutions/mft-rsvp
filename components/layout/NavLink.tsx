"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./AppShell.module.css";

/**
 * Nav item that highlights when the current route is inside it.
 *
 * Client-only because it reads the pathname; keep it as small as possible so
 * the rest of the top bar can stay on the server.
 */
export function NavLink({
  href,
  children,
  /** Match only this exact path, rather than the whole subtree. */
  exact = false,
}: {
  href: string;
  children: ReactNode;
  exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={cx(styles.navLink, active && styles.navLinkActive)}
      aria-current={active ? "page" : undefined}
    >
      {children}
    </Link>
  );
}
