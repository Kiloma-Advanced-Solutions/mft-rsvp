"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  ActionMenu,
  Button,
  ConfirmDialog,
  Icon,
  buttonClass,
  useToast,
} from "@/components/ui";
import type { ActionMenuItem } from "@/components/ui";
import { fetchJson } from "@/lib/api";
import {
  CANCEL_DIALOG,
  DELETE_DIALOG,
  DETAIL_LABELS,
  MANAGE_ACTION_COPY,
  cancelDialogCopy,
  deleteDialogMessage,
} from "@/lib/labels";

import { ShareMenu } from "./ShareEventActions";
import type { ShareState } from "./ShareEventActions";
import styles from "./HostEventActions.module.css";

/**
 * The host's actions in the event header: Publish (drafts only), Edit, the
 * Share menu, and the More menu holding Cancel and Delete.
 *
 * Edit is a `<Link>` to `?edit=1`, because it navigates rather than acts.
 * Publishing, cancelling and deleting act, and their handlers are here; the
 * two destructive ones confirm first, from the More menu. Sharing is
 * `ShareMenu`'s. What is on offer -- whether this is a draft, whether it may
 * be cancelled, whether sharing is open -- is decided on the server and passed
 * in, by the same rules the routes apply.
 *
 * No button is an authorisation boundary. This component is rendered only
 * where `canManageEvent()` allows, but every endpoint establishes identity from
 * the session and re-derives visibility and manageability from the store before
 * it writes -- so a re-enabled button or a `curl` gets the same refusal.
 *
 * Follows `RegistrationActions`: `fetchJson`, a toast carrying the server's own
 * message, then `router.refresh()` so the server-rendered view becomes the
 * truth again. No optimistic state.
 */
export function HostEventActions({
  eventId,
  isDraft,
  canCancel,
  goingCount,
  pendingCount,
  share,
}: {
  eventId: string;
  /** Sharing, as `getSharingAvailability()` and the share-link builder left it. */
  share: ShareState;
  /** Publishing only ever applies to a draft. */
  isDraft: boolean;
  /** `getCancellationAvailability()` said yes: published and not yet started. */
  canCancel: boolean;
  /**
   * Confirmed places: lost if this is deleted, kept on record if it is
   * cancelled. Both dialogs say which.
   */
  goingCount: number;
  /** And pending requests, which go or stay the same way. */
  pendingCount: number;
}) {
  const [publishing, setPublishing] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, startTransition] = useTransition();

  const router = useRouter();
  const toast = useToast();

  const busy = publishing || cancelling || deleting || working;
  const cancelCopy = cancelDialogCopy(goingCount, pendingCount);

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

  async function cancel() {
    setCancelling(true);
    try {
      // No body, like publishing: the transition is the route's, not the
      // caller's.
      await fetchJson(`/api/events/${eventId}/cancel`, { method: "POST" });
      toast.success(MANAGE_ACTION_COPY.cancelled);
    } catch (error) {
      toast.error(
        MANAGE_ACTION_COPY.cancelFailed,
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      // Closed after a failure too: a refusal here means the event is no
      // longer cancellable, and the refresh below is what shows why.
      setCancelling(false);
      setCancelOpen(false);
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

  // Cancel only where `getCancellationAvailability()` allowed it; Delete always.
  const moreItems: ActionMenuItem[] = [
    ...(canCancel
      ? [
          {
            id: "cancel",
            label: DETAIL_LABELS.cancelEvent,
            icon: "ban" as const,
            danger: true,
            onSelect: () => setCancelOpen(true),
          },
        ]
      : []),
    {
      id: "delete",
      label: DETAIL_LABELS.delete,
      icon: "trash",
      danger: true,
      onSelect: () => setConfirmOpen(true),
    },
  ];

  return (
    <>
      <div className={styles.actions}>
        {isDraft && (
          <Button onClick={publish} loading={publishing || working}>
            <Icon name="arrowUp" size="sm" />
            {DETAIL_LABELS.publish}
          </Button>
        )}
        <Link
          href={`/events/${eventId}?edit=1`}
          className={buttonClass({ variant: "secondary" })}
        >
          <Icon name="edit" size="sm" />
          {DETAIL_LABELS.edit}
        </Link>
        <ShareMenu eventId={eventId} share={share} />
        <ActionMenu
          icon="more"
          label={DETAIL_LABELS.moreActions}
          items={moreItems}
          // Nothing destructive can start while another action is running.
          disabled={busy}
        />
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onCancel={() => setCancelOpen(false)}
        onConfirm={cancel}
        title={CANCEL_DIALOG.title}
        /*
          The registrations on record come first and in bold, so a host cannot
          miss who is affected; the rest says that cancelling keeps them all.
        */
        message={
          <>
            <strong>{cancelCopy.registrations}</strong>
            <br />
            {cancelCopy.details}
          </>
        }
        confirmLabel={CANCEL_DIALOG.confirm}
        cancelLabel={CANCEL_DIALOG.cancel}
        destructive
        loading={cancelling}
      />

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={remove}
        title={DELETE_DIALOG.title}
        // Names the consequence: deleting an event ends its registrations.
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
