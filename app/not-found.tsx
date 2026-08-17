import Link from "next/link";

import { EmptyState, buttonClass } from "@/components/ui";

export default function NotFound() {
  return (
    <EmptyState
      icon="⌀"
      title="That page does not exist"
      description="The link may be stale, or the event may have been deleted."
      actions={
        <Link href="/events" className={buttonClass({ variant: "secondary" })}>
          Back to the board
        </Link>
      }
    />
  );
}
