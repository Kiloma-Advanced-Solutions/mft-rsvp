import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/ui";
import { APP_LABELS, MANAGE_LABELS } from "@/lib/labels";
import { canCreateEvent } from "@/lib/permissions";
import { getCurrentUser, listPersonas } from "@/lib/session";

import { PersonaSwitcher } from "./PersonaSwitcher";
import { RailLink } from "./RailLink";
import styles from "./AppShell.module.css";

/**
 * The frame every page sits in: a navigation rail at the inline start and a
 * centred content column beside it. On a narrow screen the same rail becomes a
 * bar across the top, with the brand at the start and the persona at the end;
 * its destinations are left to the pages, whose headers carry "new event".
 *
 * The rail is first in the document and the frame is a flex row, so `dir`
 * alone puts it on the right in Hebrew -- nothing here is mirrored by hand.
 *
 * It is a Server Component so it can read the session and the user list
 * directly, and ask the shared permission rule who may create. Only the
 * persona switcher and the current-page marker cross into the client.
 */
export async function AppShell({ children }: { children: ReactNode }) {
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    // The switcher's own order, not the store's -- see `listPersonas()`.
    listPersonas(),
  ]);

  return (
    <div className={styles.shell}>
      <header className={styles.rail}>
        <Link href="/events" className={styles.brand}>
          <Icon name="board" size="lg" />
          {APP_LABELS.brand}
        </Link>

        <PersonaSwitcher currentUser={currentUser} users={users} />

        <span className={styles.railDivider} aria-hidden />

        <nav className={styles.railNav} aria-label={APP_LABELS.mainNavigation}>
          <RailLink href="/events" icon="board" label={APP_LABELS.brand} />
          {canCreateEvent(currentUser) && (
            <RailLink
              href="/events/new"
              icon="plus"
              label={MANAGE_LABELS.create}
            />
          )}
        </nav>
      </header>

      <main className={styles.main}>
        <div className={styles.page}>{children}</div>
      </main>
    </div>
  );
}
