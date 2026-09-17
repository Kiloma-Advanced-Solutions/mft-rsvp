import Link from "next/link";

import { EmptyState, buttonClass } from "@/components/ui";
import { NOT_FOUND_LABELS } from "@/lib/labels";

export default function NotFound() {
  return (
    <EmptyState
      icon="⌀"
      title={NOT_FOUND_LABELS.title}
      description={NOT_FOUND_LABELS.description}
      actions={
        <Link href="/events" className={buttonClass({ variant: "secondary" })}>
          {NOT_FOUND_LABELS.back}
        </Link>
      }
    />
  );
}
