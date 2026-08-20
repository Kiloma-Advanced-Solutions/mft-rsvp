import { EventBoard } from "@/components/events/EventBoard";
import { PageHeader } from "@/components/ui";
import { getVisibleEventsWithContext } from "@/lib/events";
import { getCurrentUser } from "@/lib/session";

export const metadata = {
  title: "Board",
};

/**
 * The events this person is allowed to see -- visibility is decided once, on
 * the server, in `getVisibleEventsWithContext` (which calls
 * `lib/permissions.ts`). Category and access-mode filtering happen client-side
 * in `EventBoard`, on top of a list that is already safe to show.
 */
export default async function BoardPage() {
  const currentUser = await getCurrentUser();
  const events = await getVisibleEventsWithContext(currentUser);

  return (
    <div>
      <PageHeader
        title="Board"
        description={`${events.length} event${events.length === 1 ? "" : "s"} you can see, hosting and attending included.`}
      />

      <EventBoard events={events} />
    </div>
  );
}
