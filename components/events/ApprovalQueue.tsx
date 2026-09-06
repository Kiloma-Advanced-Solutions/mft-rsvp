import { Badge, Card, EmptyState, Person } from "@/components/ui";
import { formatRelativeDay } from "@/lib/date";
import {
  QUEUE_LABELS,
  requestDecisionNote,
  requestTimelineLabel,
} from "@/lib/labels";
import { requestCanBeApproved, requestCanBeRejected } from "@/lib/permissions";
import type { EventRecord, EventRequest } from "@/lib/types";

import { RequestDecisionActions } from "./RequestDecisionActions";
import styles from "./ApprovalQueue.module.css";

/**
 * The host's approval queue: who has asked for a place, what they wrote, and
 * the decision.
 *
 * A Server Component, and it derives nothing. `requests` is built by
 * `lib/events.ts` — which fills it only for a viewer who may manage the event —
 * and every row arrives with its `decision` already worked out by
 * `getRequestDecisionAvailability()`. This file only chooses how to say it, the
 * same contract `RegistrationPanel` follows.
 *
 * The one interactive part is `RequestDecisionActions`, so the requesters, their
 * messages and the timestamps never cross the client boundary.
 *
 * Rendering it is still the page's decision — the page gates on
 * `viewerCanManage`, because host-only markup must be absent rather than
 * hidden. What this component decides is whether there is a queue worth showing
 * at all: an `approval` event always has one, and any other event only once a
 * request has survived an access change into it.
 */
export function ApprovalQueue({
  event,
  requests,
}: {
  event: Pick<EventRecord, "id" | "access">;
  requests: EventRequest[];
}) {
  if (event.access !== "approval" && requests.length === 0) return null;

  const pending = requests.filter(
    (request) => request.registration.status === "pending",
  );
  const rejected = requests.filter(
    (request) => request.registration.status === "rejected",
  );

  return (
    <section>
      <div className={styles.head}>
        <h2 className={styles.title}>{QUEUE_LABELS.title}</h2>
        {pending.length > 0 && (
          <Badge tone="warning">{pending.length}</Badge>
        )}
      </div>
      <p className={styles.description}>{QUEUE_LABELS.description}</p>

      {pending.length === 0 ? (
        <EmptyState
          compact
          icon="◷"
          title={QUEUE_LABELS.emptyTitle}
          description={QUEUE_LABELS.emptyDescription}
        />
      ) : (
        <div className={styles.rows}>
          {pending.map((request) => (
            <RequestRow
              key={request.registration.id}
              eventId={event.id}
              request={request}
            />
          ))}
        </div>
      )}

      {/*
        Kept separate rather than mixed in: `TASKS.md` section 4 says a rejected
        person may not ask again but a host may still approve them, so these
        rows have to stay reachable without looking like they are still waiting.
      */}
      {rejected.length > 0 && (
        <>
          <h3 className={styles.groupTitle}>{QUEUE_LABELS.rejectedTitle}</h3>
          <div className={styles.rows}>
            {rejected.map((request) => (
              <RequestRow
                key={request.registration.id}
                eventId={event.id}
                request={request}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

/**
 * One request. The message is shown when there is one and skipped when there is
 * not — nothing in the app collects one yet, and inventing a placeholder would
 * put words under a request that has none.
 */
function RequestRow({
  eventId,
  request,
}: {
  eventId: string;
  request: EventRequest;
}) {
  const { registration, requester, requesterCanView, decision } = request;

  const canApprove = requestCanBeApproved(decision);
  const canReject = requestCanBeRejected(decision);
  const note = requestDecisionNote(decision);

  /*
    A registration is transitioned in place rather than replaced, so `createdAt`
    belongs to the row and not to the request in front of the host: somebody who
    withdrew and asked again is still carrying the date of their first attempt.
    Nothing but the request itself writes to a `pending` row, so its `updatedAt`
    is when the current cycle began. A decided row's `updatedAt` is the decision,
    so that one keeps `createdAt` and reports the decision separately.
  */
  const requestedAt =
    registration.status === "pending"
      ? registration.updatedAt
      : registration.createdAt;

  return (
    <Card subtle elevation="flat" padding="sm">
      <div className={styles.row}>
        <Person
          user={requester}
          size="sm"
          meta={requestTimelineLabel(
            formatRelativeDay(requestedAt),
            registration.decidedAt
              ? formatRelativeDay(registration.decidedAt)
              : null,
          )}
        />

        {registration.message && (
          <blockquote className={styles.message}>
            {registration.message}
          </blockquote>
        )}

        {!requesterCanView && (
          <p className={styles.warning}>{QUEUE_LABELS.requesterCannotView}</p>
        )}

        {/* Nothing left to decide: the note is the whole row's answer. */}
        {(canApprove || canReject) && (
          <RequestDecisionActions
            eventId={eventId}
            registrationId={registration.id}
            requesterName={requester.name}
            canApprove={canApprove}
            canReject={canReject}
          />
        )}

        {note && <p className={styles.note}>{note}</p>}
      </div>
    </Card>
  );
}
