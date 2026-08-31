"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, ConfirmDialog, useToast } from "@/components/ui";
import { fetchJson } from "@/lib/api";
import {
  DELETE_DIALOG,
  DETAIL_LABELS,
  MANAGE_ACTION_COPY,
  deleteDialogMessage,
} from "@/lib/labels";

import styles from "./HostEventActions.module.css";

/**
 * The two host actions on the detail page that need a handler: publishing a
 * draft and deleting the event. Editing is a plain `<Link>` to `?edit=1` and
 * needs no client code, so it stays in the page.
 *
 * Neither button is an authorisation boundary. This component is rendered only
 * where `canManageEvent()` allows, but both endpoints establish identity from
 * the session and re-derive visibility and manageability from the store before
 * they write -- so a re-enabled button or a `curl` gets the same refusal.
 *
 * Follows `RegistrationActions`: `fetchJson`, a toast carrying the server's own
 * message, then `router.refresh()` so the server-rendered view becomes the
 * truth again. No optimistic state.
 */
export function HostEventActions({
  eventId,
  isDraft,
  goingCount,
  pendingCount,
}: {
  eventId: string;
  /** Publishing only ever applies to a draft. */
  isDraft: boolean;
  /** How many people lose a confirmed place if this is deleted. */
  goingCount: number;
  /** And how many pending requests go with it -- deletion takes those too. */
  pendingCount: number;
}) {
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, startTransition] = useTransition();

  const router = useRouter();
  const toast = useToast();

  const busy = publishing || deleting || working;

  async function publish() {
    setPublishing(true);
    try {
      await fetchJson(`/api/events/${eventId}/publish`, {
        // No body: the transition is decided by the event's own status, not by
        // anything the caller says.
        method: "POST",
      });
      toast.success(MANAGE_ACTION_COPY.published);
    } catch (error) {
      toast.error(
        MANAGE_ACTION_COPY.publishFailed,
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setPublishing(false);
      // Refresh after a failure as well: a refusal usually means the page this
      // was clicked from is out of date.
      startTransition(() => router.refresh());
    }
  }

  async function remove() {
    setDeleting(true);
    try {
      await fetchJson(`/api/events/${eventId}`, { method: "DELETE" });
      toast.success(MANAGE_ACTION_COPY.deleted);
      leaveForBoard();
    } catch (error) {
      const message = error instanceof Error ? error.message : undefined;
      toast.error(MANAGE_ACTION_COPY.deleteFailed, message);
      // Keep the dialog open so the host can retry or back out.
      setDeleting(false);
    }
  }

  /**
   * `replace`, not `push`: this page is about to stop existing, and Back must
   * not return to a URL that now 404s.
   */
  function leaveForBoard() {
    startTransition(() => {
      router.replace("/events");
      router.refresh();
    });
  }

  return (
    <>
      <div className={styles.danger}>
        {isDraft && (
          <Button size="sm" onClick={publish} loading={publishing || working}>
            {DETAIL_LABELS.publish}
          </Button>
        )}
        <Button
          variant="dangerGhost"
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={busy}
        >
          {DETAIL_LABELS.delete}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
        title={DELETE_DIALOG.title}
        // Names the consequence: deleting an event deletes its registrations.
        message={deleteDialogMessage(goingCount, pendingCount)}
        confirmLabel={DELETE_DIALOG.confirm}
        cancelLabel={DELETE_DIALOG.cancel}
        destructive
        // Also makes the dialog undismissable mid-request, so Escape or a
        // backdrop click cannot abandon a delete that is already in flight.
        loading={deleting}
      />
    </>
  );
}
