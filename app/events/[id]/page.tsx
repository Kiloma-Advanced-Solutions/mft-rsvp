import { notFound } from "next/navigation";

import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";

/**
 * MILESTONE 2 — replace everything below.
 *
 * One screen serves three audiences: someone deciding whether to register, a
 * host managing their own event, and someone who should not be able to see the
 * event at all. There is no separate edit screen — the host's controls live
 * here. See TASKS.md.
 *
 * Note what this stub does *not* do: it renders any event it finds, with no
 * visibility check. That is the first thing to fix.
 */
export default async function EventDetailPage({
  params,
}: PageProps<"/events/[id]">) {
  const { id } = await params;
  const event = await db.events.get(id);

  if (!event) notFound();

  return (
    <div>
      <PageHeader
        backHref="/events"
        backLabel="Back to board"
        eyebrow={event.access}
        title={event.title}
        description={event.summary}
      />

      <EmptyState
        icon="◷"
        title="The detail screen is yours to build"
        description="Registration, host controls, the attendee list and the approval queue all live on this page. Right now it will happily show an invite-only event to someone who was never invited — start there."
      />
    </div>
  );
}
