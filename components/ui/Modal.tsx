"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import { Button } from "./Button";
import styles from "./Modal.module.css";

/**
 * Modal built on the native `<dialog>` element, so focus trapping, the top
 * layer, inert background content and Escape-to-close come from the platform
 * rather than from us.
 *
 * Keep it controlled: `open` drives it, `onClose` is called for every way out
 * (the close button, Escape, or a click on the backdrop).
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
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={cx(styles.dialog, size !== "md" && styles[size])}
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
        <header className={styles.header}>
          <div className={styles.titleGroup}>
            <h2 className={styles.title}>{title}</h2>
            {description && <p className={styles.description}>{description}</p>}
          </div>
          {dismissible && (
            <button
              type="button"
              className={styles.close}
              onClick={onClose}
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </header>

        <div className={styles.body}>{children}</div>

        {footer && <footer className={styles.footer}>{footer}</footer>}
      </div>
    </dialog>
  );
}

/**
 * Destructive-action confirmation. Reach for this before deleting anything —
 * "are you sure" is cheap, an accidentally deleted event is not.
 */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
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
      size="sm"
      dismissible={!loading}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className={styles.confirmMessage}>{message}</p>
    </Modal>
  );
}
