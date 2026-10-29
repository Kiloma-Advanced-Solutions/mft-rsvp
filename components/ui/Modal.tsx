"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import { UI_LABELS } from "@/lib/labels";

import { Button } from "./Button";
import { Icon } from "./Icon";
import styles from "./Modal.module.css";

/** Marks the control a dialog focuses when it opens: `data-initial-focus`. */
const INITIAL_FOCUS = "data-initial-focus";

/**
 * Modal built on the native `<dialog>` element, so focus trapping, the top
 * layer, inert background content and Escape-to-close come from the platform
 * rather than from us.
 *
 * Keep it controlled: `open` drives it, `onClose` is called for every way out
 * (the close button, Escape, or a click on the backdrop).
 *
 * The dialog is named by its title and described by its description, when it
 * has one: a visible heading alone does not name a `<dialog>`, so without these
 * a screen reader would announce an unnamed dialog.
 *
 * Opening, the platform focuses the first focusable control. A control marked
 * with `INITIAL_FOCUS` takes it instead, moved in the same task as
 * `showModal()`, so no key press can land on whatever came first. React's
 * `autoFocus` cannot do this: it focuses on mount, while the dialog is closed.
 */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  /** Set false for flows where dismissing halfway would lose work. */
  dismissible = true,
  /** The visible close button. Escape and the backdrop still dismiss without it. */
  closeButton = true,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
  closeButton?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      // The dialog stays mounted while closed, so a header scrolled last time
      // would reopen scrolled; every opening starts at the title. Only once it
      // is shown -- a closed dialog has no layout, and ignores the reset.
      if (headerRef.current) headerRef.current.scrollTop = 0;
      dialog.querySelector<HTMLElement>(`[${INITIAL_FOCUS}]`)?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, size !== "md" && styles[size])}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      // Escape fires `cancel`; let the parent decide rather than closing behind its back.
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onClose();
      }}
      // A click that lands on the dialog element itself is a click on the backdrop:
      // anything inside the panel is caught by the panel.
      onClick={(event) => {
        if (dismissible && event.target === ref.current) onClose();
      }}
    >
      <div className={styles.panel}>
        <header ref={headerRef} className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 id={titleId} className={styles.title}>
              {title}
            </h2>
            {description && (
              <p id={descriptionId} className={styles.description}>
                {description}
              </p>
            )}
          </div>
          {dismissible && closeButton && (
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label={UI_LABELS.close}
            >
              <Icon name="close" />
            </button>
          )}
        </header>

        {children && <div className={styles.body}>{children}</div>}

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}

/**
 * Destructive-action confirmation. Reach for this before deleting anything —
 * "are you sure" is cheap, an accidentally deleted event is not.
 *
 * The action leads and the way back follows it, as the design system orders
 * them, but focus opens on the way back: Enter or Space straight after opening
 * never confirms. There is no close button; Escape, the backdrop and the
 * cancel action are the ways out, and none of them while a request is running.
 * The message is the dialog's description, so it is announced with the title.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = UI_LABELS.confirm,
  cancelLabel = UI_LABELS.cancel,
  destructive = false,
  loading = false,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: ReactNode;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      description={message}
      size="sm"
      dismissible={!loading}
      closeButton={false}
      footer={
        <div className={styles.confirmActions}>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            data-initial-focus
          >
            {cancelLabel}
          </Button>
        </div>
      }
    />
  );
}
