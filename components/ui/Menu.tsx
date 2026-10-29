"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./Menu.module.css";

/**
 * A menu button whose items are one exclusive choice, like the persona
 * switcher: each item is a `menuitemradio`, and exactly the checked one says
 * so.
 *
 * Keyboard, as the ARIA menu-button pattern has it: Enter, Space or Down on
 * the trigger opens the menu on the checked item; Up and Down move through the
 * items and wrap, Home and End jump to the ends; Escape closes it and returns
 * focus to the trigger; Tab closes it and lets focus move on. A pointer press
 * outside closes it without moving focus.
 *
 * `onSelect` reports whether the menu should close, so a choice that fails can
 * leave it open for another try. While `busy`, the items still take focus but
 * do not act, so a second choice cannot start while the first is in flight.
 *
 * The popup stays in the document while closed, hidden, so the trigger's
 * `aria-controls` always points at something. Placement is the caller's, via
 * `popupClassName`.
 */
export function Menu({
  trigger,
  triggerLabel,
  label,
  heading,
  note,
  options,
  onSelect,
  busy = false,
  className,
  triggerClassName,
  popupClassName,
}: {
  /** The trigger's visible content. */
  trigger: ReactNode;
  /** The trigger's accessible name, when its visible content is not enough. */
  triggerLabel?: string;
  /** The menu's accessible name. */
  label: string;
  /** Shown above the items. Hidden from assistive technology, which hears `label`. */
  heading?: ReactNode;
  /** Shown below the items, and announced as the menu's description. */
  note?: ReactNode;
  options: Array<{ id: string; content: ReactNode; checked: boolean }>;
  onSelect: (id: string) => boolean | Promise<boolean>;
  busy?: boolean;
  className?: string;
  triggerClassName?: string;
  popupClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /** The item to focus once the popup is visible. */
  const focusOnOpen = useRef(0);
  const menuId = useId();
  const noteId = useId();

  const checkedIndex = Math.max(
    0,
    options.findIndex((option) => option.checked),
  );

  useEffect(() => {
    if (!open) return;

    itemRefs.current[focusOnOpen.current]?.focus();

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  function openAt(index: number) {
    focusOnOpen.current = index;
    setOpen(true);
  }

  function closeToTrigger() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      openAt(checkedIndex);
    }
  }

  function onMenuKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const items = itemRefs.current.filter(
      (item): item is HTMLButtonElement => item !== null,
    );
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const last = items.length - 1;

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        items[current >= last ? 0 : current + 1]?.focus();
        break;
      case "ArrowUp":
        event.preventDefault();
        items[current <= 0 ? last : current - 1]?.focus();
        break;
      case "Home":
        event.preventDefault();
        items[0]?.focus();
        break;
      case "End":
        event.preventDefault();
        items[last]?.focus();
        break;
      case "Escape":
        event.preventDefault();
        closeToTrigger();
        break;
      case "Tab":
        // Backwards, the trigger is the previous stop. Forwards, focus moves
        // from the trigger to whatever follows it; the items are never stops.
        if (event.shiftKey) {
          event.preventDefault();
          closeToTrigger();
        } else {
          triggerRef.current?.focus();
          setOpen(false);
        }
        break;
    }
  }

  async function choose(id: string) {
    if (busy) return;
    if (await onSelect(id)) closeToTrigger();
  }

  return (
    <div ref={rootRef} className={cx(styles.root, className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cx(styles.trigger, triggerClassName)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={triggerLabel}
        onClick={() => (open ? setOpen(false) : openAt(checkedIndex))}
        onKeyDown={onTriggerKeyDown}
      >
        {trigger}
      </button>

      <div className={cx(styles.popup, popupClassName)} hidden={!open}>
        {heading && (
          <p className={styles.heading} aria-hidden>
            {heading}
          </p>
        )}

        <div
          id={menuId}
          role="menu"
          aria-label={label}
          aria-describedby={note ? noteId : undefined}
          aria-busy={busy || undefined}
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
        >
          {options.map((option, index) => (
            <button
              key={option.id}
              ref={(item) => {
                itemRefs.current[index] = item;
              }}
              type="button"
              role="menuitemradio"
              aria-checked={option.checked}
              aria-disabled={busy || undefined}
              tabIndex={-1}
              className={styles.item}
              onClick={() => choose(option.id)}
            >
              {option.content}
            </button>
          ))}
        </div>

        {note && (
          <>
            <div className={styles.separator} aria-hidden />
            <p id={noteId} className={styles.note}>
              {note}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
