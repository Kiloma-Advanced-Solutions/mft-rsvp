import Link from "next/link";
import type { ReactNode } from "react";

import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

import { NavLink } from "./NavLink";
import { PersonaSwitcher } from "./PersonaSwitcher";
import styles from "./AppShell.module.css";

/**
 * The frame every page sits in: sticky top bar, centred content column.
 *
 * It is a Server Component so it can read the session and the user list
 * directly. Only the two interactive bits below it — the nav highlight and the
 * persona switcher — cross into the client.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    db.users.list(),
  ]);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link href="/" className={styles.brand}>
            <span className={styles.brandMark} aria-hidden>
              E
            </span>
            <span className={styles.brandName}>Events Board</span>
          </Link>

          <nav className={styles.nav} aria-label="Main">
            <NavLink href="/events">Board</NavLink>
            <NavLink href="/styleguide">Style guide</NavLink>
          </nav>

          <PersonaSwitcher currentUser={currentUser} users={users} />
        </div>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
