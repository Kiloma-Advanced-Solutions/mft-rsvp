"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Avatar, Badge, Menu, useToast } from "@/components/ui";
import { fetchJson } from "@/lib/api";
import {
  PERSONA_LABELS,
  ROLE_LABELS,
  nowViewingAsLabel,
  switchPersonaLabel,
} from "@/lib/labels";
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
 *
 * It sits at the top of the navigation rail, and at the end of the bar that
 * replaces the rail on a narrow screen, where only the avatar shows. A switch
 * that fails leaves the menu open for another try.
 */
export function PersonaSwitcher({
  currentUser,
  users,
}: {
  currentUser: User;
  users: User[];
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const router = useRouter();
  const toast = useToast();

  async function switchTo(userId: string): Promise<boolean> {
    const user = users.find((candidate) => candidate.id === userId);
    if (!user || user.id === currentUser.id) return true;

    setPendingId(user.id);
    try {
      await fetchJson("/api/session", {
        method: "POST",
        body: JSON.stringify({ userId: user.id }),
      });
      router.refresh();
      toast.info(nowViewingAsLabel(user.name), user.title);
      return true;
    } catch (error) {
      toast.error(
        PERSONA_LABELS.switchFailed,
        error instanceof Error ? error.message : undefined,
      );
      return false;
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Menu
      className={styles.root}
      triggerClassName={styles.trigger}
      popupClassName={styles.popup}
      triggerLabel={switchPersonaLabel(currentUser.name)}
      trigger={
        <>
          <Avatar user={currentUser} size="lg" className={styles.avatar} />
          <span className={styles.triggerText}>
            <span dir="auto">{currentUser.name}</span>
            <span className={styles.triggerRole}>
              {ROLE_LABELS[currentUser.role]}
            </span>
          </span>
        </>
      }
      label={PERSONA_LABELS.menuLabel}
      heading={PERSONA_LABELS.menuLabel}
      note={PERSONA_LABELS.footnote}
      busy={pendingId !== null}
      onSelect={switchTo}
      options={users.map((user) => {
        const active = user.id === currentUser.id;
        return {
          id: user.id,
          checked: active,
          content: (
            <>
              <Avatar user={user} size="sm" />
              <span className={styles.optionText}>
                <span className={styles.optionName} dir="auto">
                  {user.name}
                </span>
                <span className={styles.optionMeta} dir="auto">
                  {user.title}
                </span>
              </span>
              <Badge tone={active ? "primary" : "neutral"}>
                {ROLE_LABELS[user.role]}
              </Badge>
            </>
          ),
        };
      })}
    />
  );
}
