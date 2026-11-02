"use client";

import { useEffect, useRef } from "react";
import type { MouseEvent, ReactNode } from "react";

/** A navigation that has not committed by then is treated as abandoned. */
const PENDING_LIMIT_MS = 10_000;

/**
 * Takes the links inside it one at a time, so a quick second choice is not
 * built on a page that is about to change.
 *
 * Links that change a server-rendered page's own state -- filters, a section
 * -- carry the whole state in their `href`, as it was when the page was
 * rendered. Click one, then another before the first navigation commits, and
 * the second link still describes the old page: following it undoes the first
 * choice. So while a navigation to this same route is pending, further clicks
 * on such links are held, in order. Each time `location` changes -- a
 * navigation committed and the links were re-rendered from the new state --
 * the next held click is replayed on its link, whose `href` is now current.
 * The URLs, the history entries and the scroll behaviour stay the links' own.
 * A link that stays on the page must therefore keep its element across
 * renders: key it by what it stands for, never by its `href`, which changes
 * with the URL and would replace the element the held click refers to.
 *
 * A held link may no longer exist after the page changes (one inside an empty
 * state, say). It is then replayed through a link that is still there with the
 * same `data-nav-intent`. A link that can disappear should carry an intent
 * that a lasting link shares, or one that no longer applies once no link has
 * it -- clearing filters, when nothing is left to clear.
 *
 * Only plain clicks on links to this same path are held. Links elsewhere --
 * to another page -- and clicks that open a new tab are left alone.
 */
export function QueuedNavigation({
  location,
  children,
}: {
  /**
   * The page's current canonical URL. It changes when a navigation commits,
   * which is when the next held click may run.
   */
  location: string;
  children: ReactNode;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pending = useRef<{ href: string; since: number } | null>(null);
  const held = useRef<HTMLAnchorElement[]>([]);

  useEffect(() => {
    pending.current = null;

    // Replay the next held click that still has somewhere to go. Its click
    // handler below marks it pending, so the rest wait for its commit.
    while (held.current.length > 0) {
      const link = resolve(held.current.shift()!, containerRef.current);
      if (link && link.getAttribute("href") !== location) {
        link.click();
        return;
      }
    }
  }, [location]);

  function onClickCapture(event: MouseEvent<HTMLDivElement>) {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const link = (event.target as Element).closest("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    const url = new URL(link.href);
    if (
      url.origin !== window.location.origin ||
      url.pathname !== window.location.pathname
    ) {
      return;
    }

    const current = pending.current;
    if (current) {
      if (Date.now() - current.since < PENDING_LIMIT_MS) {
        // Stops the link's own navigation, which would use its stale `href`.
        event.preventDefault();
        held.current.push(link);
        return;
      }
      // That navigation never committed; what was held behind it goes too.
      held.current = [];
    }

    const href = link.getAttribute("href");
    pending.current =
      href !== null && href !== location ? { href, since: Date.now() } : null;
  }

  return (
    <div ref={containerRef} onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}

/**
 * The link to replay a held click on: the same one if it is still on the
 * page, otherwise a link that is, with the same intent. `null` when neither
 * exists, which means the action no longer applies.
 */
function resolve(
  link: HTMLAnchorElement,
  container: HTMLElement | null,
): HTMLAnchorElement | null {
  if (link.isConnected) return link;

  const intent = link.dataset.navIntent;
  if (!intent || !container) return null;
  return container.querySelector<HTMLAnchorElement>(
    `a[data-nav-intent="${CSS.escape(intent)}"]`,
  );
}
