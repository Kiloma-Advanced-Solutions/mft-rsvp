"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button, useToast } from "@/components/ui";
import { fetchJson } from "@/lib/api";
import {
  QUEUE_LABELS,
  REQUEST_ACTION_COPY,
  approveRequestLabel,
  rejectRequestLabel,
} from "@/lib/labels";

import styles from "./ApprovalQueue.module.css";

type Decision = "approve" | "reject";

/**
 * The approve / reject buttons for one request. The only client code in the
 * approval queue — the rows, the messages and the timestamps stay on the
 * server, so who asked and what they wrote is never shipped to a browser that
 * had no business receiving it.
 *
 * It decides nothing about whether the action is allowed. `canApprove` and
 * `canReject` come from `getRequestDecisionAvailability()` on the server, and
 * both route handlers work the same answer out again from the store before they
 * write. A disabled or absent button is an affordance; the refusal that matters
 * happens on the server.
 *
 * Follows `RegistrationActions`: `fetchJson`, a toast carrying the server's own
 * message, then `router.refresh()` inside a transition so the server-rendered
 * view becomes the truth again — after a failure as well as a success, because
 * a refusal usually means the page it was clicked from is out of date. No
 * optimistic state.
 */
export function RequestDecisionActions({
  eventId,
  registrationId,
  requesterName,
  canApprove,
  canReject,
}: {
  eventId: string;
  registrationId: string;
  /** Only for the accessible name — a column of "Approve" says nothing. */
  requesterName: string;
  canApprove: boolean;
  canReject: boolean;
}) {
  const [deciding, setDeciding] = useState<Decision | null>(null);
  const [refreshing, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  // Both controls stay disabled until the request has answered *and* the server
  // has re-rendered, so a row the store has already moved past cannot briefly
  // become clickable again. Only the button that was pressed shows the spinner.
  const busy = deciding !== null || refreshing;

  async function decide(decision: Decision) {
    setDeciding(decision);
    try {
      await fetchJson(
        `/api/events/${eventId}/registrations/${registrationId}/${decision}`,
        // No body: the actor is the session, the target is the URL, and the
        // transition is the route.
        { method: "POST" },
      );
      toast.success(
        decision === "approve"
          ? REQUEST_ACTION_COPY.approved
          : REQUEST_ACTION_COPY.rejected,
      );
    } catch (error) {
      toast.error(
        decision === "approve"
          ? REQUEST_ACTION_COPY.approveFailed
          : REQUEST_ACTION_COPY.rejectFailed,
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setDeciding(null);
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className={styles.actions}>
      {/*
        Approve is always rendered for a row that has any decision left, and
        disabled when the event is full — an explanation next to a greyed-out
        button reads better than a button that silently vanishes. Reject is
        absent instead, because a request that was already turned down has
        nothing to reject.
      */}
      <Button
        size="sm"
        onClick={() => decide("approve")}
        loading={deciding === "approve"}
        disabled={!canApprove || busy}
        aria-label={approveRequestLabel(requesterName)}
      >
        {QUEUE_LABELS.approve}
      </Button>

      {canReject && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => decide("reject")}
          loading={deciding === "reject"}
          disabled={busy}
          aria-label={rejectRequestLabel(requesterName)}
        >
          {QUEUE_LABELS.reject}
        </Button>
      )}
    </div>
  );
}
