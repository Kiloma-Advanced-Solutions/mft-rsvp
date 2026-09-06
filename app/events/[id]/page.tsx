import Link from "next/link";
import { notFound } from "next/navigation";

import { ApprovalQueue } from "@/components/events/ApprovalQueue";
import { EventForm } from "@/components/events/EventForm";
import {
  AccessBadge,
  EventMetaDetails,
  EventStatusBadge,
} from "@/components/events/EventMeta";
import { HostEventActions } from "@/components/events/HostEventActions";
import { RegistrationPanel } from "@/components/events/RegistrationPanel";
import {
  Badge,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Person,
  buttonClass,
} from "@/components/ui";
import { getEventDetailForViewer } from "@/lib/events";
import { toFormValues } from "@/lib/eventInput";
import { CATEGORY_LABELS, DETAIL_LABELS, MANAGE_LABELS } from "@/lib/labels";
import { getRegistrationAvailability } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/session";
import type { EventRecord, User } from "@/lib/types";

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
            <AccessBadge access={event.access} size="lg" />
            <EventStatusBadge event={event} size="lg" />
          </div>
        }
      />

      {editing ? (
        <Card>
          <EventForm
            mode={{ kind: "edit", eventId: event.id }}
            // Converted on the server, so the client never recomputes a
            // `datetime-local` value and cannot disagree about the timezone.
            initialValues={toFormValues(event)}
            goingCount={goingCount}
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

            <Attendees attendees={attendees} goingCount={goingCount} />
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

/** Plain text, with blank lines separating paragraphs — see `EventRecord`. */
function Description({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).filter((part) => part.trim() !== "");

  return (
    <div className={styles.description}>
      {paragraphs.map((paragraph, index) => (
        <p key={index} className={styles.paragraph}>
          {paragraph}
        </p>
      ))}
    </div>
  );
}

/**
 * Who is going. `goingCount` rather than `attendees.length` is the headline,
 * because only `going` rows count and a row whose person has left the company
 * still holds a place.
 */
function Attendees({
  attendees,
  goingCount,
}: {
  attendees: User[];
  goingCount: number;
}) {
  return (
    <section>
      <div className={styles.attendeesHead}>
        <h2 className={styles.sectionTitle}>{DETAIL_LABELS.attendees}</h2>
        {goingCount > 0 && <Badge tone="neutral">{goingCount}</Badge>}
      </div>

      {attendees.length === 0 ? (
        <p className={styles.muted}>{DETAIL_LABELS.noAttendees}</p>
      ) : (
        <div className={styles.people}>
          {attendees.map((attendee) => (
            <Person key={attendee.id} user={attendee} size="sm" />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * The host's half of the screen — there is no separate edit screen, so this is
 * where management lives.
 *
 * Edit is a `<Link>` because it navigates rather than acts: it turns on the
 * `?edit=1` mode this same page renders. Publish and delete do act, so they
 * live in a client leaf. Deciding requests is the approval queue's job, and it
 * lives in the main column where there is room for what people wrote.
 */
function HostTools({
  event,
  pendingCount,
  goingCount,
}: {
  event: EventRecord;
  pendingCount: number;
  goingCount: number;
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

        <HostEventActions
          eventId={event.id}
          isDraft={event.status === "draft"}
          goingCount={goingCount}
          pendingCount={pendingCount}
        />

        {/*
          Only facts a non-host never sees, and only ones that are not already
          on the page. The status, the access mode and the capacity are here for
          everybody; the number awaiting approval left when the queue gained its
          own heading and count in the main column, because repeating it here
          would be two of the same number side by side.
        */}
        {event.access === "invite" && (
          <dl className={styles.facts}>
            <Fact
              label={DETAIL_LABELS.factInvited}
              value={String(event.invitedUserIds.length)}
            />
          </dl>
        )}
      </CardBody>
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={styles.factValue}>{value}</dd>
    </div>
  );
}
