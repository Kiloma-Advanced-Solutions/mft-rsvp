"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import { cx } from "@/lib/cx";

import styles from "./Toast.module.css";

/**
 * Lightweight toast notifications.
 *
 * The provider is mounted once in the root layout, so any Client Component can
 * do:
 *
 *   const toast = useToast();
 *   toast.success("Registration confirmed");
 *   toast.error(error.message);
 *
 * Use it for the outcome of an action the person just took. Do not use it to
 * report state that should be visible on the page itself — a toast disappears.
 */
type ToastTone = "success" | "error" | "info";

type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastApi = {
  show: (tone: ToastTone, title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

const AUTO_DISMISS_MS = 4500;

/** Monotonic so two toasts fired in the same millisecond cannot collide. */
let nextToastId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const api = useMemo<ToastApi>(() => {
    const show = (tone: ToastTone, title: string, description?: string) => {
      const id = nextToastId++;
      setItems((current) => [...current, { id, tone, title, description }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    };

    return {
      show,
      success: (title, description) => show("success", title, description),
      error: (title, description) => show("error", title, description),
      info: (title, description) => show("info", title, description),
    };
  }, [dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className={styles.viewport} role="region" aria-label="Notifications">
        {items.map((item) => (
          <div
            key={item.id}
            className={cx(styles.toast, styles[item.tone])}
            role={item.tone === "error" ? "alert" : "status"}
          >
            <div className={styles.content}>
              <p className={styles.title}>{item.title}</p>
              {item.description && (
                <p className={styles.description}>{item.description}</p>
              )}
            </div>
            <button
              type="button"
              className={styles.dismiss}
              onClick={() => dismiss(item.id)}
              aria-label="Dismiss notification"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used inside <ToastProvider>.");
  }
  return api;
}
