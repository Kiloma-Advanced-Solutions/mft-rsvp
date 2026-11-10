import { notFound } from "next/navigation";

import { ApprovalQueue } from "@/components/events/ApprovalQueue";
import { AttendeeList } from "@/components/events/AttendeeList";
import { EventForm } from "@/components/events/EventForm";
import {
  AccessBadge,
  CategoryLabel,
  EventMetaDetails,
  EventStatusBadge,
  ViewerRegistrationBadge,
} from "@/components/events/EventMeta";
import { HostEventActions } from "@/components/events/HostEventActions";
import { InvitationList } from "@/components/events/InvitationList";
import { RegistrationPanel } from "@/components/events/RegistrationPanel";
import type { ShareState } from "@/components/events/ShareEventActions";
import { Card, PageHeader, Person } from "@/components/ui";
import type { Breadcrumb } from "@/components/ui";
import { getEventDetailForViewer } from "@/lib/events";
import { toFormValues } from "@/lib/eventInput";
import {
  BOARD_LABELS,
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
  isHost,
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
    attendanceCount,
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
    attendanceCount,
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

  const eventHref = `/events/${event.id}`;
  /*
    The trail replaces the old back link. In edit mode the event is a step of
    its own, linked without `?edit=1`, so leaving the form for the event --
    rather than for the board -- stays one click away, as the back link was.
  */
  const breadcrumbs: Breadcrumb[] = editing
    ? [
        { label: BOARD_LABELS.title, href: "/events" },
        { label: event.title, href: eventHref },
        { label: MANAGE_LABELS.editTitle },
      ]
    : [
        { label: BOARD_LABELS.title, href: "/events" },
        { label: event.title },
      ];

  return (
    <div>
      <PageHeader
        breadcrumbs={breadcrumbs}
        eyebrow={<CategoryLabel category={event.category} />}
        title={editing ? MANAGE_LABELS.editTitle : event.title}
        description={editing ? undefined : event.summary}
        /*
          The host's actions -- Publish, Edit, Share, More -- for whoever
          `canManageEvent()` allows, and absent from the markup for everyone
          else: hiding them in CSS would still ship them to a member. Not in
          edit mode, where the form is the page.
        */
        actions={
          viewerCanManage && !editing ? (
            <HostEventActions
              eventId={event.id}
              isDraft={event.status === "draft"}
              canCancel={getCancellationAvailability(event).state === "open"}
              attendanceCount={attendanceCount}
              pendingCount={pendingCount}
              // Built only for a manager, so never `null` here.
              share={shareState(event, shareRecipients ?? [])}
            />
          ) : undefined
        }
        centerTitle
        meta={
          <>
            {/* A cancellation leads, as on the board's card. */}
            {event.status === "cancelled" && (
              <EventStatusBadge event={event} size="lg" />
            )}
            <AccessBadge access={event.access} size="lg" />
            {event.status !== "cancelled" && (
              <EventStatusBadge event={event} size="lg" />
            )}
            {/* Where the viewer stands, not part of editing the event. */}
            {viewerRegistration && !editing && (
              <ViewerRegistrationBadge
                status={viewerRegistration.status}
                size="lg"
              />
            )}
          </>
        }
      />

      {/*
        Above both columns, so it is the first thing under the title on every
        screen width. It stays in edit mode too: editing a cancelled event
        never restores it.
      */}
      {event.status === "cancelled" && (
        <div className={styles.cancelledNotice}>
          <span className={styles.cancelledNoticeDot} aria-hidden />
          <div>
            <p className={styles.cancelledNoticeTitle}>
              {DETAIL_LABELS.cancelledNoticeTitle}
            </p>
            <p className={styles.cancelledNoticeText}>
              {DETAIL_LABELS.cancelledNoticeText}
            </p>
          </div>
        </div>
      )}

      {editing ? (
        // The form sets out its own section cards.
        <EventForm
          mode={{ kind: "edit", eventId: event.id }}
          // Converted on the server, so the client never recomputes a
          // `datetime-local` value and cannot disagree about the timezone.
          initialValues={toFormValues(event)}
          scheduleLock={scheduleLock(event)}
        />
      ) : (
        <div className={styles.layout}>
          {/*
            First in the document, so on a narrow screen -- one column, in
            source order -- the panel comes straight after the header (and the
            cancelled notice), and keyboard order matches what is seen. On a
            wide screen the grid places it in the side column instead.
          */}
          <aside className={styles.aside}>
            <RegistrationPanel
              event={event}
              availability={availability}
              attendanceCount={attendanceCount}
              viewerRegistration={viewerRegistration}
              viewerIsHost={isHost(event, viewer)}
            />
          </aside>

          <div className={styles.main}>
            <Card>
              <section>
                <h2 className={styles.sectionTitle}>
                  {DETAIL_LABELS.whenWhere}
                </h2>
                <EventMetaDetails event={event} />
              </section>
            </Card>

            <Card>
              <section>
                <h2 className={styles.sectionTitle}>{DETAIL_LABELS.about}</h2>
                <Description text={event.description} />
              </section>
            </Card>

            <Card>
              <section>
                <h2 className={styles.sectionTitle}>{DETAIL_LABELS.hosts}</h2>
                <div className={styles.people}>
                  {hosts.map((host) => (
                    <Person key={host.id} user={host} />
                  ))}
                </div>
              </section>
            </Card>

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
              hosts={hosts}
              attendees={attendees}
              attendanceCount={attendanceCount}
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
 * Sharing, for the header's Share menu, decided here on the server: whether
 * it is open comes from `getSharingAvailability()`, the URL from
 * `buildEventShareUrl()`, and the client leaf is handed a finished string or
 * the sentence saying why not. A base URL that is not configured costs the
 * host this one menu, not the page, and nothing falls back to the request's
 * own host.
 *
 * The recipients are ids, names and job titles only -- never an email
 * address, which the route reads on the server. They are offered whether or
 * not this server can send mail; a send that cannot go says so when tried.
 */
function shareState(event: EventRecord, recipients: User[]): ShareState {
  const sharing = getSharingAvailability(event);
  if (sharing.state === "closed") {
    return { state: "closed", note: sharingClosedNote(sharing.reason) };
  }

  const url = buildEventShareUrl(event.id);
  if (url === null) return { state: "closed", note: SHARE_LABELS.unavailable };

  return {
    state: "open",
    url,
    recipients: recipients.map(({ id, name, title }) => ({ id, name, title })),
  };
}
