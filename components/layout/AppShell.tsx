import Link from "next/link";
import type { ReactNode } from "react";

import { APP_LABELS } from "@/lib/labels";
import { getCurrentUser, listPersonas } from "@/lib/session";

import { PersonaSwitcher } from "./PersonaSwitcher";
import styles from "./AppShell.module.css";

/**
 * The frame every page sits in: sticky top bar, centred content column.
 *
 * It is a Server Component so it can read the session and the user list
 * directly. Only the interactive bit below it — the persona switcher — crosses
 * into the client. The brand is the one link: the board is the only top-level
 * destination, so there is no separate nav.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    // The switcher's own order, not the store's -- see `listPersonas()`.
    listPersonas(),
  ]);

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link
            href="/events"
            className={styles.brand}
            aria-label={APP_LABELS.brand}
          >
            <span className={styles.brandMark} aria-hidden>
              E
            </span>
            <span className={styles.brandName}>{APP_LABELS.brand}</span>
          </Link>

          <PersonaSwitcher currentUser={currentUser} users={users} />
        </div>
      </header>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
