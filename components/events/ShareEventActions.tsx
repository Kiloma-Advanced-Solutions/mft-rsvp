"use client";

import { useState } from "react";

import { Button, Field, Input, useToast } from "@/components/ui";
import { SHARE_LABELS } from "@/lib/labels";

import styles from "./ShareEventActions.module.css";

/**
 * The host's way of handing an event to somebody: copy its link.
 *
 * Interaction only. Whether sharing is on offer, and the URL itself, are worked
 * out on the server -- the page renders this only for someone
 * `canManageEvent()` allows, only while `getSharingAvailability()` is open, and
 * only with a URL `buildEventShareUrl()` produced. Nothing here builds a URL or
 * reads `window.location`.
 *
 * The link grants nothing, so this is not an authorisation boundary either: a
 * member who copies the address bar has the same URL and the same access.
 *
 * Copying changes no server state, so unlike the other host actions there is no
 * `router.refresh()`. A clipboard refusal -- a denied permission, or an origin
 * that is not a secure context once deployed -- is reported, and the URL is
 * shown in a read-only field so the host can still copy it by hand.
 */
export function ShareEventActions({ eventUrl }: { eventUrl: string }) {
  const [showField, setShowField] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      // Absent outside a secure context, so it fails here rather than later.
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(eventUrl);
      toast.success(SHARE_LABELS.copied);
    } catch {
      toast.error(SHARE_LABELS.copyFailed, SHARE_LABELS.copyFailedHint);
      setShowField(true);
    }
  }

  return (
    <div className={styles.share}>
      <Button variant="secondary" size="sm" onClick={copy}>
        {SHARE_LABELS.copyLink}
      </Button>
      <p className={styles.hint}>{SHARE_LABELS.hint}</p>

      {showField && (
        <Field label={SHARE_LABELS.linkField} className={styles.field}>
          <Input
            readOnly
            value={eventUrl}
            // A URL is left-to-right; `auto` lets the content say so rather
            // than overriding the document's direction.
            dir="auto"
            // Selected on focus, so one keystroke copies it.
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>
      )}
    </div>
  );
}
