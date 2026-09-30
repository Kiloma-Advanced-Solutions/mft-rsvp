"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, ConfirmDialog, useToast } from "@/components/ui";
import { fetchJson } from "@/lib/api";
import {
  ATTENDEE_ACTION_COPY,
  ATTENDEE_LABELS,
  REMOVE_ATTENDEE_DIALOG,
  removeAttendeeDialogMessage,
  removeAttendeeLabel,
  restoreAttendeeLabel,
} from "@/lib/labels";

/**
 * The remove or restore button for one attendee. The only client code in the
 * attendee list — the people, the ids of everyone else's rows and why an action
 * is closed all stay on the server.
 *
 * It decides nothing about whether the action is allowed. Whether it is shown,
 * and whether it is enabled, comes from `getAttendeeRemovalAvailability()` and
 * `getAttendeeRestoreAvailability()` on the server, and both routes work the
 * same answer out again before they write. A disabled or absent button is an
 * affordance; the refusal that matters happens on the server.
 *
 * Removing asks first, because it may not be undoable: somebody else can take
 * the place before a host gives it back. Restoring does not — it only ever
 * gives a place.
 *
 * Follows `RequestDecisionActions`: `fetchJson`, a toast carrying the server's
 * own message, then `router.refresh()` inside a transition so the
 * server-rendered view becomes the truth again — after a failure as well as a
 * success. No optimistic state.
 */
export function AttendeeActions({
  eventId,
  registrationId,
  attendeeName,
  action,
  disabled = false,
  inviteOnly = false,
}: {
  eventId: string;
  registrationId: string;
  /** For the accessible name and the dialog — a column of "הסרה" says nothing. */
  attendeeName: string;
  action: "remove" | "restore";
  /** The server's rule said no, and the row explains why beside the button. */
  disabled?: boolean;
  /** Whether the dialog should say that the invitation stays. */
  inviteOnly?: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  // Busy until the request has answered *and* the server has re-rendered, so a
  // row the store has already moved past cannot briefly become clickable again.
  const busy = submitting || refreshing;
  const removing = action === "remove";

  async function submit() {
    setSubmitting(true);
    try {
      await fetchJson(
        `/api/events/${eventId}/registrations/${registrationId}/${action}`,
        // No body: the actor is the session, the target is the URL, and the
        // transition is the route.
        { method: "POST" },
      );
      toast.success(
        removing ? ATTENDEE_ACTION_COPY.removed : ATTENDEE_ACTION_COPY.restored,
      );
    } catch (error) {
      toast.error(
        removing
          ? ATTENDEE_ACTION_COPY.removeFailed
          : ATTENDEE_ACTION_COPY.restoreFailed,
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      // Closed after a failure too, as the cancel dialog is: a refusal means the
      // row moved, and the refresh below is what shows how.
      setSubmitting(false);
      setConfirmOpen(false);
      startTransition(() => router.refresh());
    }
  }

  if (!removing) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={submit}
        loading={busy}
        disabled={disabled}
        aria-label={restoreAttendeeLabel(attendeeName)}
      >
        {ATTENDEE_LABELS.restore}
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="dangerGhost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={disabled || busy}
        aria-label={removeAttendeeLabel(attendeeName)}
      >
        {ATTENDEE_LABELS.remove}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submit}
        title={REMOVE_ATTENDEE_DIALOG.title}
        message={removeAttendeeDialogMessage(attendeeName, inviteOnly)}
        confirmLabel={REMOVE_ATTENDEE_DIALOG.confirm}
        cancelLabel={REMOVE_ATTENDEE_DIALOG.cancel}
        destructive
        // Also makes the dialog undismissable mid-request.
        loading={submitting}
      />
    </>
  );
}
