import type { ReactNode } from "react";

import { cx } from "@/lib/cx";
import type { User } from "@/lib/types";

import styles from "./Avatar.module.css";

type AvatarSize = "xs" | "sm" | "md" | "lg";

export function Avatar({
  user,
  size = "md",
  className,
}: {
  user: Pick<User, "name" | "initials" | "accent">;
  size?: AvatarSize;
  className?: string;
}) {
  return (
    <span
      className={cx(styles.avatar, styles[size], styles[user.accent], className)}
      title={user.name}
      aria-hidden
    >
      {user.initials}
    </span>
  );
}

/**
 * Overlapping avatars for a group of people. Anything past `max` collapses into
 * a "+N" chip so a full event does not blow out the card layout.
 */
export function AvatarStack({
  users,
  max = 4,
  size = "sm",
  className,
}: {
  users: Array<Pick<User, "id" | "name" | "initials" | "accent">>;
  max?: number;
  size?: AvatarSize;
  className?: string;
}) {
  const shown = users.slice(0, max);
  const overflow = users.length - shown.length;

  return (
    <span
      className={cx(styles.stack, className)}
      aria-label={
        users.length === 0
          ? "Nobody registered yet"
          : `${users.length} attending: ${users.map((user) => user.name).join(", ")}`
      }
    >
      {shown.map((user) => (
        <Avatar key={user.id} user={user} size={size} />
      ))}
      {overflow > 0 && (
        <span
          className={cx(styles.avatar, styles[size], styles.overflow)}
          aria-hidden
        >
          +{overflow}
        </span>
      )}
    </span>
  );
}

/** Avatar with the person's name, and an optional second line. */
export function Person({
  user,
  size = "md",
  meta,
  className,
}: {
  user: User;
  size?: AvatarSize;
  /** Defaults to the person's job title. */
  meta?: ReactNode;
  className?: string;
}) {
  return (
    <span className={cx(styles.person, className)}>
      <Avatar user={user} size={size} />
      <span className={styles.personText}>
        <span className={styles.personName}>{user.name}</span>
        <span className={styles.personMeta}>{meta ?? user.title}</span>
      </span>
    </span>
  );
}
