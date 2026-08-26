import { notFound } from "next/navigation";

import {
  AccessBadge,
  EventMetaDetails,
  EventStatusBadge,
} from "@/components/events/EventMeta";
import { RegistrationPanel } from "@/components/events/RegistrationPanel";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  PageHeader,
  Person,
} from "@/components/ui";
import { getEventDetailForViewer } from "@/lib/events";
import { CATEGORY_LABELS, DETAIL_LABELS } from "@/lib/labels";
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
 * `lib/permissions.ts`, which the board and the future registration routes also
 * call, so there is one answer to "can this person see this" in the codebase.
 */
export default async function EventDetailPage({
  params,
}: PageProps<"/events/[id]">) {
  const [viewer, { id }] = await Promise.all([getCurrentUser(), params]);
  const detail = await getEventDetailForViewer(id, viewer);

  if (!detail) notFound();

  const {
    event,
    hosts,
    goingCount,
    pendingCount,
    attendees,
    viewerRegistration,
    viewerCanManage,
  } = detail;

  const availability = getRegistrationAvailability(event, viewer, {
    goingCount,
    viewerRegistration,
  });

  return (
    <div>
      <PageHeader
        backHref="/events"
        backLabel={DETAIL_LABELS.back}
        eyebrow={CATEGORY_LABELS[event.category]}
        title={event.title}
        description={event.summary}
        actions={
          <div className={styles.headerBadges}>
            <AccessBadge access={event.access} size="lg" />
            <EventStatusBadge event={event} size="lg" />
          </div>
        }
      />

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
            <HostTools event={event} pendingCount={pendingCount} />
          )}
        </aside>
      </div>
    </div>
  );
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
 * The controls are in their final place and their visibility is already correct
 * (publishing only ever applies to a draft), but they do nothing yet: editing
 * and publishing are M4, and approving requests is M5. Rendering them inert now
 * keeps the gating reviewable without pretending the actions work.
 */
function HostTools({
  event,
  pendingCount,
}: {
  event: EventRecord;
  pendingCount: number;
}) {
  return (
    <Card padding="none">
      <CardHeader
        title={DETAIL_LABELS.hostTools}
        description={DETAIL_LABELS.hostToolsDescription}
      />

      <CardBody>
        <div className={styles.hostActions}>
          <Button variant="secondary" size="sm" disabled>
            {DETAIL_LABELS.edit}
          </Button>
          {event.status === "draft" && (
            <Button size="sm" disabled>
              {DETAIL_LABELS.publish}
            </Button>
          )}
        </div>

        <p className={styles.inactive}>{DETAIL_LABELS.notYetActive}</p>

        {/*
          Only facts a non-host never sees. The status, the access mode and the
          capacity are already on this page for everybody, and repeating them
          here would just be two of the same number side by side.
        */}
        <dl className={styles.facts}>
          <Fact label={DETAIL_LABELS.factPending} value={String(pendingCount)} />
          {event.access === "invite" && (
            <Fact
              label={DETAIL_LABELS.factInvited}
              value={String(event.invitedUserIds.length)}
            />
          )}
        </dl>
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
