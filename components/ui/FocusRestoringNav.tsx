"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * A `<nav>` of links that takes keyboard focus back when a navigation strands
 * it.
 *
 * Links elsewhere on a server-rendered page can navigate to a state in which
 * they no longer exist -- a "show the other section" link inside an empty
 * state, a "clear the filters" link that is only shown while filtering. The
 * browser then drops focus to the document body, and a keyboard or screen
 * reader user is left nowhere. After each change of `location`, if focus was
 * dropped like that, this moves it to the nav's current link
 * (`aria-current="page"`), so it lands on what the navigation chose.
 *
 * It never takes focus otherwise: not on first render, and not when focus is
 * still on something -- a link that survived the navigation keeps it. The
 * links themselves stay ordinary links rendered by the server; this only owns
 * the `<nav>` element around them.
 */
export function FocusRestoringNav({
  location,
  label,
  className,
  children,
}: {
  /**
   * What the nav's links navigate between, e.g. the page's canonical URL. A
   * change in it is a navigation that may have dropped focus.
   */
  location: string;
  label: string;
  className?: string;
  children: ReactNode;
}) {
  const navRef = useRef<HTMLElement>(null);
  const previous = useRef(location);

  useEffect(() => {
    if (previous.current === location) return;
    previous.current = location;

    const active = document.activeElement;
    if (active !== null && active !== document.body) return;

    navRef.current
      ?.querySelector<HTMLElement>('[aria-current="page"]')
      ?.focus();
  }, [location]);

  return (
    <nav ref={navRef} className={className} aria-label={label}>
      {children}
    </nav>
  );
}
