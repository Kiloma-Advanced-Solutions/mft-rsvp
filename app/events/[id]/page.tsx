import Link from "next/link";
import { notFound } from "next/navigation";

import { ApprovalQueue } from "@/components/events/ApprovalQueue";
import { AttendeeList } from "@/components/events/AttendeeList";
import { EventForm } from "@/components/events/EventForm";
import {
  AccessBadge,
  EventMetaDetails,
  EventStatusBadge,
} from "@/components/events/EventMeta";
import { HostEventActions } from "@/components/events/HostEventActions";
import { InvitationList } from "@/components/events/InvitationList";
import { RegistrationPanel } from "@/components/events/RegistrationPanel";
import {
  ShareEmailPicker,
  ShareEventActions,
} from "@/components/events/ShareEventActions";
import {
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Person,
  buttonClass,
} from "@/components/ui";
import { getEventDetailForViewer } from "@/lib/events";
import { toFormValues } from "@/lib/eventInput";
import {
  CATEGORY_LABELS,
  DETAIL_LABELS,
  MANAGE_LABELS,
  SHARE_LABELS,
  sharingClosedNote,
} from "@/lib/labels";
import {
  getCancellationAvailability,
  getRegistrationAvailability,
  getScheduleAvailability,
  getSharingAvailability,
} from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import { buildEventShareUrl } from "@/lib/shareLinks";
import type { EventRecord, ScheduleLockReason, User } from "@/lib/types";

import styles from "./detail.module.css";

/**
 * One event, one screen, three audiences: someone deciding whether to register,
 * a host managing their own event, and someone who should not know the event
 * exists at all.
 *
 * A Server Component throughout. The third audience is served first:
 * `getEventDetailForViewer` returns `null` for an event that is missing *or*
 * invisible, and this page turns both into the same 404 — `TASKS.md` section 4
 * requires that, because a 403 would confirm the event exists. The check runs
 * before anything renders, so the response really is a 404 and nothing about
 * the event reaches the markup.
 *
 * Visibility and manageability are not decided here. They come from
 * `lib/permissions.ts`, which the board and the registration route also call,
 * so there is one answer to "can this person see this" in the codebase — and
 * the route works that answer out again from the store before it writes, so a
 * stale page cannot talk it into anything.
 */
export default async function EventDetailPage({
  params,
  searchParams,
}: PageProps<"/events/[id]">) {
  const [viewer, { id }, query] = await Promise.all([
    getCurrentUser(),
    params,
    searchParams,
  ]);
  const detail = await getEventDetailForViewer(id, viewer);

  if (!detail) notFound();

  const {
    event,
    hosts,
    goingCount,
    pendingCount,
    attendees,
    requests,
    managedAttendees,
    invitations,
    shareRecipients,
    viewerRegistration,
    viewerCanManage,
  } = detail;

  const availability = getRegistrationAvailability(event, viewer, {
    goingCount,
    viewerRegistration,
  });

  /*
    Edit mode lives in the URL, the way the board's filters do, so the page
    stays a Server Component and the form's starting values come from this
    render. It is gated on manageability here, not merely styled away: a member
    appending `?edit=1` gets the ordinary read view, and someone who may not see
    the event at all has already 404'd above.
  */
  const editing = viewerCanManage && isEditing(query.edit);

  return (
    <div>
      <PageHeader
        /*
          In edit mode the back action leaves edit mode rather than the event,
          so it cannot be mistaken for a way out of the form and quietly
          discard unsaved changes. Outside edit mode it is the board, as before.
        */
        backHref={editing ? `/events/${event.id}` : "/events"}
        backLabel={editing ? MANAGE_LABELS.backToEvent : DETAIL_LABELS.back}
        eyebrow={CATEGORY_LABELS[event.category]}
        title={editing ? MANAGE_LABELS.editTitle : event.title}
        description={editing ? MANAGE_LABELS.editDescription : event.summary}
        actions={
          <div className={styles.headerBadges}>
            {/* A cancellation leads, as on the board's card. */}
            {event.status === "cancelled" && (
              <EventStatusBadge event={event} size="lg" />
            )}
            <AccessBadge access={event.access} size="lg" />
            {event.status !== "cancelled" && (
              <EventStatusBadge event={event} size="lg" />
            )}
          </div>
        }
      />

      {/*
        Above both columns, so it is the first thing under the title on every
        screen width -- the registration panel's note stacks below the whole
        main column on a narrow one. It stays in edit mode too: editing a
        cancelled event never restores it.
      */}
      {event.status === "cancelled" && (
        <div className={styles.cancelledNotice}>
          <p className={styles.cancelledNoticeTitle}>
            {DETAIL_LABELS.cancelledNoticeTitle}
          </p>
          <p className={styles.cancelledNoticeText}>
            {DETAIL_LABELS.cancelledNoticeText}
          </p>
        </div>
      )}

      {editing ? (
        <Card>
          <EventForm
            mode={{ kind: "edit", eventId: event.id }}
            // Converted on the server, so the client never recomputes a
            // `datetime-local` value and cannot disagree about the timezone.
            initialValues={toFormValues(event)}
            goingCount={goingCount}
            scheduleLock={scheduleLock(event)}
          />
        </Card>
      ) : (
        <div className={styles.layout}>
          <div className={styles.main}>
            <Card>
              <EventMetaDetails event={event} />
            </Card>

            <section>
              <h2 className={styles.sectionTitle}>{DETAIL_LABELS.about}</h2>
              <Description text={event.description} />
            </section>

            <section>
              <h2 className={styles.sectionTitle}>{DETAIL_LABELS.hosts}</h2>
              <div className={styles.people}>
                {hosts.map((host) => (
                  <Person key={host.id} user={host} />
                ))}
              </div>
            </section>

            {/*
              The host's queue sits above the attendee list: it is the part of
              this screen that is waiting on them, and burying it under a long
              list of people who are already in would be the wrong way round.
              Absent from the markup for everyone else — the loader leaves
              `requests` empty for them as well, so there is nothing to hide.
            */}
            {viewerCanManage && (
              <ApprovalQueue event={event} requests={requests} />
            )}

            {/*
              Hosts get the same list with an action beside each attendee and
              the people who were removed; everybody else gets `null` here,
              and the loader left `managedAttendees` empty for them anyway.
            */}
            <AttendeeList
              event={event}
              attendees={attendees}
              goingCount={goingCount}
              managed={viewerCanManage ? managedAttendees : null}
            />

            {/*
              Who may see the event, below who is coming to it: the queue is
              the urgent part, the attendees are the event, and this list is
              how a host shapes who gets in. Absent from the markup for anyone
              who may not manage the event -- the loader left `invitations`
              `null` for them, an invitee included, so there is nothing to
              hide. The component itself renders nothing for an event that is
              not invite-only and has no invitations left from when it was.
            */}
            {viewerCanManage && invitations && (
              <InvitationList eventId={event.id} invitations={invitations} />
            )}
          </div>

          <aside className={styles.aside}>
            <RegistrationPanel
              event={event}
              availability={availability}
              goingCount={goingCount}
              viewerRegistration={viewerRegistration}
            />

            {/*
              Host tools exist only for whoever `canManageEvent()` allows, and are
              absent from the markup for everyone else — hiding them in CSS would
              still ship them to a member.
            */}
            {viewerCanManage && (
              <HostTools
                event={event}
                pendingCount={pendingCount}
                goingCount={goingCount}
                // Built only for a manager, so never `null` here.
                shareRecipients={shareRecipients ?? []}
              />
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/**
 * Whether the URL is asking for edit mode.
 *
 * A query value is untrusted input, and `searchParams` hands over
 * `string | string[] | undefined`, so `?edit=1&edit=2` arrives as an array.
 * Anything that is not exactly the expected value means "not editing" -- the
 * same treatment the board gives its filters.
 */
function isEditing(value: string | string[] | undefined): boolean {
  return value === "1";
}

/**
 * Why the form's dates are locked, with the stored dates it validates them as,
 * or `undefined` when they may change. Decided here, on the server, by the
 * same rule the `PATCH` route runs; the form only disables what this says is
 * locked.
 */
function scheduleLock(
  event: EventRecord,
):
  | { reason: ScheduleLockReason; startsAt: string; endsAt: string }
  | undefined {
  const availability = getScheduleAvailability(event, Date.now());
  if (availability.state !== "locked") return undefined;
  return {
    reason: availability.reason,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
  };
}

/** Plain text, with blank lines separating paragraphs — see `EventRecord`. */
function Description({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).filter((part) => part.trim() !== "");

  return (
    <div className={styles.description}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={styles.paragraph} dir="auto">
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/**
 * The host's half of the screen — there is no separate edit screen, so this is
 * where management lives.
 *
 * Edit is a `<Link>` because it navigates rather than acts: it turns on the
 * `?edit=1` mode this same page renders. Publish, cancel and delete do act, so
 * they live in a client leaf. Whether cancelling is on offer comes from the
 * same rule the cancel route applies, so the button and the API agree. Sharing
 * sits between Edit and those actions, in `ShareTool` below.
 * Deciding requests is the approval queue's job, and it lives in the main
 * column where there is room for what people wrote; managing who is invited is
 * the invitation list's, in the main column for the same reason, and it carries
 * its own count.
 */
function HostTools({
  event,
  pendingCount,
  goingCount,
  shareRecipients,
}: {
  event: EventRecord;
  pendingCount: number;
  goingCount: number;
  shareRecipients: User[];
}) {
  return (
    <Card padding="none">
      <CardHeader
        title={DETAIL_LABELS.hostTools}
        description={DETAIL_LABELS.hostToolsDescription}
      />

      <CardBody>
        <div className={styles.hostActions}>
          <Link
            href={`/events/${event.id}?edit=1`}
            className={buttonClass({ variant: "secondary", size: "sm" })}
          >
            {DETAIL_LABELS.edit}
          </Link>
        </div>

        <ShareTool event={event} recipients={shareRecipients} />

        <HostEventActions
          eventId={event.id}
          isDraft={event.status === "draft"}
          canCancel={getCancellationAvailability(event).state === "open"}
          goingCount={goingCount}
          pendingCount={pendingCount}
        />
      </CardBody>
    </Card>
  );
}

/**
 * Sharing, inside the host tools: the copy action while there is something
 * worth sharing, and otherwise a sentence saying why not -- the way the
 * invitation list explains a closed picker rather than leaving a gap.
 *
 * Every decision is made here, on the server: whether sharing is open comes
 * from `getSharingAvailability()`, the URL from `buildEventShareUrl()`, and the
 * client leaf is handed a finished string. A base URL that is not configured
 * costs the host this one tool, not the page, and nothing falls back to the
 * request's own host.
 *
 * Emailing the link sits under copying it, in the same open state: both need
 * the same link. The picker gets ids, names and job titles only -- never an
 * email address, which the route reads on the server. It is shown whether or
 * not this server can send mail; a send that cannot go says so when tried.
 */
function ShareTool({
  event,
  recipients,
}: {
  event: EventRecord;
  recipients: User[];
}) {
  const sharing = getSharingAvailability(event);
  const eventUrl =
    sharing.state === "open" ? buildEventShareUrl(event.id) : null;

  return (
    <div className={styles.shareTool}>
      {sharing.state === "closed" ? (
        <p className={styles.hostNote}>{sharingClosedNote(sharing.reason)}</p>
      ) : eventUrl === null ? (
        <p className={styles.hostNote}>{SHARE_LABELS.unavailable}</p>
      ) : (
        <>
          <ShareEventActions eventUrl={eventUrl} />
          <ShareEmailPicker
            eventId={event.id}
            recipients={recipients.map(({ id, name, title }) => ({
              id,
              name,
              title,
            }))}
          />
        </>
      )}
    </div>
  );
}
