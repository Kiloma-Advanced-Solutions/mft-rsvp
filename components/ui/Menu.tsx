"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

import { cx } from "@/lib/cx";

import { buttonClass } from "./Button";
import { Icon } from "./Icon";
import type { IconName } from "./Icon";
import styles from "./Menu.module.css";

/**
 * The menu-button keyboard model both menus below share, as the ARIA pattern
 * has it: Up and Down move through the items and wrap, Home and End jump to
 * the ends; Escape closes the menu and returns focus to the trigger; Tab
 * closes it and lets focus move on, Shift+Tab back to the trigger. A pointer
 * press outside closes it without moving focus. Opening focuses the item
 * `openAt` was given.
 */
function useMenuButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  /** The item to focus once the popup is visible. */
  const focusOnOpen = useRef(0);

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

  return {
    open,
    setOpen,
    rootRef,
    triggerRef,
    itemRefs,
    openAt,
    closeToTrigger,
    onMenuKeyDown,
  };
}

/**
 * The room an action menu keeps from each side of the screen: what its
 * popup's `max-width` leaves over, so the CSS stays the one place that sets
 * it. Resolved from the stylesheet even while the popup is hidden.
 */
function screenGutter(popup: HTMLElement) {
  const viewport = document.documentElement.clientWidth;
  return (viewport - parseFloat(getComputedStyle(popup).maxWidth)) / 2 || 0;
}

/**
 * Keeps a trigger's tooltip, centred under it, inside the screen less the
 * popup's gutter. A trigger that wraps to the edge of a narrow row would
 * otherwise push half of it off the screen -- and as it stays laid out while
 * invisible, push the page into sideways scroll as well. Physical pixels, so
 * either direction works the same. Touch screens never show it: see
 * `.tooltip`.
 */
function keepTooltipOnScreen(
  tooltip: HTMLElement | null,
  popup: HTMLElement | null,
) {
  if (!tooltip || !popup) return;

  tooltip.style.translate = "";
  const viewport = document.documentElement.clientWidth;
  const gutter = screenGutter(popup);
  const { left, right, width } = tooltip.getBoundingClientRect();
  // Not laid out on a touch screen, so there is nothing to place.
  if (width === 0) return;
  const shift =
    left < gutter
      ? gutter - left
      : right > viewport - gutter
        ? viewport - gutter - right
        : 0;
  if (shift !== 0) tooltip.style.translate = `${shift}px 0`;
}

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
  const {
    open,
    setOpen,
    rootRef,
    triggerRef,
    itemRefs,
    openAt,
    closeToTrigger,
    onMenuKeyDown,
  } = useMenuButton();
  const menuId = useId();
  const noteId = useId();

  const checkedIndex = Math.max(
    0,
    options.findIndex((option) => option.checked),
  );

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      openAt(checkedIndex);
    }
  }

  async function choose(id: string) {
    if (busy) return;
    if (!(await onSelect(id))) return;

    // A choice can take a while. If the person has left the menu in the
    // meantime -- Tab, a click elsewhere -- focus is theirs now: close without
    // taking it back. The root holds the trigger and the popup, so focus on
    // either still counts as being in the menu.
    if (rootRef.current?.contains(document.activeElement)) {
      closeToTrigger();
    } else {
      setOpen(false);
    }
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

/** One action in an `ActionMenu`. */
export type ActionMenuItem = {
  id: string;
  label: string;
  icon?: IconName;
  /** Destructive: shown in the danger colour. */
  danger?: boolean;
  /**
   * Shown, focusable and announced, but it does nothing -- `note` says why.
   * Kept in the menu rather than removed, so the reason sits where the action
   * would be.
   */
  disabled?: boolean;
  /** A line under the item, announced as its description. */
  note?: ReactNode;
  onSelect?: () => void;
};

/**
 * A menu of actions behind a round icon button, like the event header's Share
 * and More: each item is a `menuitem` that does one thing.
 *
 * Keyboard as `Menu` above, except that opening -- Enter, Space or Down on the
 * trigger, or a click -- focuses the first item. A disabled item still takes
 * focus, as the ARIA pattern recommends, so a screen reader reaches it and
 * hears its note; choosing it does nothing and leaves the menu open.
 *
 * Choosing an action closes the menu and puts focus back on the trigger
 * *before* the action runs. An action that opens a dialog therefore opens it
 * from the trigger, and the native dialog returns focus there when it closes
 * -- not to an item that is hidden by then.
 *
 * `label` is the trigger's accessible name, its tooltip and the menu's name.
 * Placement of the popup is the caller's, via `popupClassName`.
 */
export function ActionMenu({
  icon,
  label,
  items,
  note,
  disabled = false,
  className,
  popupClassName,
}: {
  icon: IconName;
  label: string;
  items: ActionMenuItem[];
  /** Shown below the items, and announced as the menu's description. */
  note?: ReactNode;
  /** The trigger itself, while something it started is still running. */
  disabled?: boolean;
  className?: string;
  popupClassName?: string;
}) {
  const {
    open,
    setOpen,
    rootRef,
    triggerRef,
    itemRefs,
    openAt,
    closeToTrigger,
    onMenuKeyDown,
  } = useMenuButton();
  const menuId = useId();
  const noteId = useId();
  const itemNoteId = useId();
  const popupRef = useRef<HTMLDivElement>(null);

  /*
    Where the popup opens, worked out once it is visible and before it is
    painted. It is laid out with its end edge on the trigger's, growing
    towards the start, and measured there: whatever it overflows on that side
    is never scrollable, so laying it out cannot widen a phone's page. It then
    moves in one horizontal shift to
      - grow towards the end instead, when the trigger has more room on that
        side -- a trigger that has wrapped to the start of a narrow row has
        none towards the start; and
      - stay inside the screen, less the gutter its `max-width` leaves, which
        it always fits -- on a phone a trigger mid-row can have less room than
        the menu on either side.
    Physical pixels throughout, so either direction works the same. Written to
    the element rather than kept in state, as the pickers size their lists:
    it is a measurement of this render, and nothing else reads it.
  */
  useLayoutEffect(() => {
    if (!open) return;

    function place() {
      const popup = popupRef.current;
      const trigger = triggerRef.current;
      if (!popup || !trigger) return;

      popup.style.translate = "";
      const viewport = document.documentElement.clientWidth;
      const gutter = screenGutter(popup);
      const rtl = getComputedStyle(trigger).direction === "rtl";
      const anchor = trigger.getBoundingClientRect();
      const { left, width } = popup.getBoundingClientRect();

      // Towards the start is rightwards in RTL, leftwards in LTR.
      const startRoom = rtl ? viewport - anchor.left : anchor.right;
      const endRoom = rtl ? anchor.right : viewport - anchor.left;
      const towardsEnd = endRoom > startRoom ? width - anchor.width : 0;
      const placed = left + (rtl ? -towardsEnd : towardsEnd);
      const kept = Math.min(
        Math.max(placed, gutter),
        viewport - gutter - width,
      );

      if (kept !== left) popup.style.translate = `${kept - left}px 0`;
    }

    // Placed again if the screen changes while it is open -- a phone turned
    // on its side re-wraps the row the trigger is in.
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, triggerRef]);

  const tooltipRef = useRef<HTMLSpanElement>(null);

  /*
    The tooltip is placed on mount and on resize, and again as it is about to
    show -- on pointer enter and on focus -- so a row that has re-wrapped since
    is caught. See `keepTooltipOnScreen`.
  */
  function placeTooltip() {
    keepTooltipOnScreen(tooltipRef.current, popupRef.current);
  }

  useLayoutEffect(() => {
    const place = () =>
      keepTooltipOnScreen(tooltipRef.current, popupRef.current);
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, []);

  /** Opens on the first item; the effect above places it. */
  function show() {
    openAt(0);
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" && !open) {
      event.preventDefault();
      show();
    }
  }

  function choose(item: ActionMenuItem) {
    if (item.disabled) return;
    closeToTrigger();
    item.onSelect?.();
  }

  return (
    <div ref={rootRef} className={cx(styles.root, className)}>
      <button
        ref={triggerRef}
        type="button"
        className={cx(
          buttonClass({ variant: "secondary", iconOnly: true }),
          styles.iconTrigger,
        )}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onTriggerKeyDown}
        onPointerEnter={placeTooltip}
        onFocus={placeTooltip}
      >
        <Icon name={icon} />
        <span ref={tooltipRef} className={styles.tooltip} aria-hidden>
          {label}
        </span>
      </button>

      <div
        ref={popupRef}
        className={cx(styles.popup, popupClassName)}
        hidden={!open}
      >
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          aria-describedby={note ? noteId : undefined}
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              ref={(element) => {
                itemRefs.current[index] = element;
              }}
              type="button"
              role="menuitem"
              aria-label={item.label}
              aria-disabled={item.disabled || undefined}
              aria-describedby={item.note ? `${itemNoteId}-${index}` : undefined}
              tabIndex={-1}
              className={cx(
                styles.item,
                styles.actionItem,
                item.danger && styles.danger,
                item.disabled && styles.disabled,
              )}
              onClick={() => choose(item)}
            >
              <span className={styles.actionRow}>
                {item.icon && <Icon name={item.icon} />}
                {item.label}
              </span>
              {item.note && (
                <span id={`${itemNoteId}-${index}`} className={styles.itemNote}>
                  {item.note}
                </span>
              )}
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
