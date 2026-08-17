"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Avatar, Badge, useToast } from "@/components/ui";
import { fetchJson } from "@/lib/api";
import { cx } from "@/lib/cx";
import type { User } from "@/lib/types";

import styles from "./PersonaSwitcher.module.css";

/**
 * Stands in for authentication.
 *
 * Pick a persona and the whole app re-renders as that person — which is how you
 * check that an invite-only event really is invisible to someone who was not
 * invited, and that a member never sees an edit control.
 *
 * `router.refresh()` after the switch re-runs every Server Component with the
 * new cookie. Without it the page would keep showing the previous persona's view.
 */
export function PersonaSwitcher({
  currentUser,
  users,
}: {
  currentUser: User;
  users: User[];
}) {
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function switchTo(user: User) {
    if (user.id === currentUser.id) {
      setOpen(false);
      return;
    }

    setPendingId(user.id);
    try {
      await fetchJson("/api/session", {
        method: "POST",
        body: JSON.stringify({ userId: user.id }),
      });
      setOpen(false);
      router.refresh();
      toast.info(`Now viewing as ${user.name}`, user.title);
    } catch (error) {
      toast.error(
        "Could not switch persona",
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className={styles.wrapper} ref={wrapperRef}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <Avatar user={currentUser} size="sm" />
        <span className={styles.triggerText}>
          <span className={styles.triggerName}>{currentUser.name}</span>
          <span className={styles.triggerRole}>{currentUser.role}</span>
        </span>
        <span className={styles.caret} aria-hidden>
          ▼
        </span>
      </button>

      {open && (
        <div className={styles.menu} role="menu">
          <p className={styles.menuLabel}>View the board as</p>

          {users.map((user) => {
            const active = user.id === currentUser.id;
            return (
              <button
                key={user.id}
                type="button"
                role="menuitem"
                className={cx(styles.option, active && styles.optionActive)}
                onClick={() => switchTo(user)}
                disabled={pendingId !== null}
              >
                <Avatar user={user} size="sm" />
                <span className={styles.optionText}>
                  <span className={styles.optionName}>{user.name}</span>
                  <span className={styles.optionMeta}>{user.title}</span>
                </span>
                <Badge tone={active ? "primary" : "neutral"}>{user.role}</Badge>
                {active && (
                  <span className={styles.check} aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            );
          })}

          <p className={styles.footnote}>
            There is no login in this project. Switching persona sets a cookie the
            server reads on every request.
          </p>
        </div>
      )}
    </div>
  );
}
