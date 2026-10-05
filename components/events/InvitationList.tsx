import { Badge, Card, EmptyState, Person } from "@/components/ui";
import {
  INVITATION_LABELS,
  invitationClosedNote,
} from "@/lib/labels";
import type { EventInvitations, InvitedPerson } from "@/lib/types";

import { RegistrationBadge } from "./EventMeta";
import { InvitePicker, RevokeInvitationButton } from "./InvitationActions";
import styles from "./InvitationList.module.css";

/**
 * The host's invitation list: who may see this invite-only event, where each of
 * them stands, and who may be added.
 *
 * A Server Component, and it derives nothing. `invitations` is built by
 * `lib/events.ts` only for a viewer who may manage the event -- everyone else,
 * an invitee included, gets `null` and the page renders nothing -- and every
 * answer in it was already worked out by the rules in `lib/permissions.ts`.
 * This file only chooses how to say it, the same contract `ApprovalQueue` and
 * `AttendeeList` follow.
 *
 * What it decides is whether there is a list worth showing at all, the way
 * `ApprovalQueue` does: an invite-only event always has one, empty or not,
 * because that is where inviting starts; any other event only while it still
 * holds invitations from when it was invite-only, shown read-only.
 *
 * The client parts are the picker and the revoke buttons. They receive ids,
 * names, the job titles the picker lists under each name, and the one flag the
 * dialog needs -- never the event, the list, or anybody's email.
 */
export function InvitationList({
  eventId,
  invitations,
}: {
  eventId: string;
  invitations: EventInvitations;
}) {
  const { active, inviting, invitees, candidates } = invitations;
  if (!active && invitees.length === 0) return null;

  return (
    <section>
      <div className={styles.head}>
        <h2 className={styles.title}>{INVITATION_LABELS.title}</h2>
        {invitees.length > 0 && <Badge tone="neutral">{invitees.length}</Badge>}
      </div>
      <p className={styles.description}>
        {active
          ? INVITATION_LABELS.description
          : INVITATION_LABELS.dormantDescription}
      </p>

      {invitees.length === 0 ? (
        <EmptyState
          compact
          icon="✉"
          title={INVITATION_LABELS.emptyTitle}
          description={INVITATION_LABELS.emptyDescription}
        />
      ) : (
        <div className={styles.rows}>
          {invitees.map((person) => (
            <InviteeRow
              key={person.invitee.id}
              eventId={eventId}
              person={person}
              reinviteClosed={inviting.state === "closed"}
            />
          ))}
        </div>
      )}

      {/*
        Adding people. A dormant list says why it is inactive above and offers
        nothing here; an active one either offers the picker, says nobody is
        left to invite, or says why the list is closed to additions.
      */}
      {active && (
        <div className={styles.adding}>
          {inviting.state === "closed" ? (
            <p className={styles.note}>{invitationClosedNote(inviting.reason)}</p>
          ) : candidates.length === 0 ? (
            <p className={styles.note}>{INVITATION_LABELS.noCandidates}</p>
          ) : (
            <InvitePicker
              eventId={eventId}
              candidates={candidates.map((user) => ({
                id: user.id,
                name: user.name,
                title: user.title,
              }))}
            />
          )}
        </div>
      )}
    </section>
  );
}

/**
 * One invitee: the person, their registration status -- or that they have not
 * registered, since an invitation does not imply one -- and a revoke button
 * wherever the rule allows it.
 */
function InviteeRow({
  eventId,
  person,
  reinviteClosed,
}: {
  eventId: string;
  person: InvitedPerson;
  reinviteClosed: boolean;
}) {
  const { invitee, registrationStatus, revocation } = person;

  return (
    <Card subtle elevation="flat" padding="sm">
      <div className={styles.row}>
        <Person user={invitee} size="sm" />
        <div className={styles.rowEnd}>
          {registrationStatus === null ? (
            <Badge tone="neutral" variant="outline">
              {INVITATION_LABELS.notRegistered}
            </Badge>
          ) : (
            <RegistrationBadge status={registrationStatus} />
          )}
          {revocation.state === "open" && (
            <RevokeInvitationButton
              eventId={eventId}
              userId={invitee.id}
              inviteeName={invitee.name}
              reinviteClosed={reinviteClosed}
            />
          )}
        </div>
      </div>
    </Card>
  );
}
