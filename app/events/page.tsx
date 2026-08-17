import { EmptyState, PageHeader } from "@/components/ui";
import { db } from "@/lib/db";

export const metadata = {
  title: "Board",
};

/**
 * MILESTONE 1 — replace everything below.
 *
 * This stub exists so the route is real and so you can see the page
 * conventions: a Server Component that reads the store directly, a
 * `PageHeader`, and page-level actions in its `actions` slot.
 *
 * What the board has to do is in TASKS.md. The short version: show the events
 * this person is allowed to see, and nothing else.
 */
export default async function BoardPage() {
  const events = await db.events.list();

  return (
    <div>
      <PageHeader
        title="Board"
        description="Everything you can register for, and everything you host."
      />

      <EmptyState
        icon="◳"
        title="The board is yours to build"
        description={`The store already has ${events.length} seeded events waiting behind db.events.list(). Milestone 1 in TASKS.md describes what belongs here — filtering by what the viewer is allowed to see comes first, the calendar view comes later.`}
      />
    </div>
  );
}
