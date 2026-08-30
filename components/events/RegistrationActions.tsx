"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button, useToast } from "@/components/ui";
import { fetchJson } from "@/lib/api";
import { REGISTRATION_ACTION_COPY } from "@/lib/labels";
import type { RegistrationAvailability } from "@/lib/types";

/**
 * The register / request / withdraw button. The only client code on the event
 * detail screen.
 *
 * It decides nothing about whether the action is allowed. `availability` was
 * worked out on the server by `getRegistrationAvailability()`, and the route
 * handler works it out again from the store before it writes anything -- so
 * this component only picks the method to call and reports what came back. A
 * disabled or missing button is an affordance; the refusal that matters happens
 * on the server.
 *
 * `router.refresh()` runs after a failure as well as a success. A refusal
 * usually means the page it was clicked from is out of date -- the event filled
 * up, or started -- and the refresh is what replaces it with the truth.
 */
export function RegistrationActions({
  eventId,
  availability,
  label,
}: {
  eventId: string;
  availability: RegistrationAvailability;
  /** Already chosen by `registrationCtaCopy()`, so the wording has one home. */
  label: string;
}) {
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const withdrawing = availability.state === "registered";

  async function submit() {
    setSubmitting(true);
    try {
      await fetchJson(`/api/events/${eventId}/registrations`, {
        // No body: the server takes the actor from the session and the
        // resulting status from the event's access mode.
        method: withdrawing ? "DELETE" : "POST",
      });
      toast.success(successTitle(availability));
    } catch (error) {
      toast.error(
        failureTitle(availability),
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      setSubmitting(false);
      router.refresh();
    }
  }

  return (
    <Button
      variant={withdrawing ? "secondary" : "primary"}
      fullWidth
      loading={submitting}
      onClick={submit}
    >
      {label}
    </Button>
  );
}

function successTitle(availability: RegistrationAvailability): string {
  if (availability.state === "registered") {
    return REGISTRATION_ACTION_COPY.withdrawn;
  }
  return availability.state === "open" && availability.action === "request"
    ? REGISTRATION_ACTION_COPY.requested
    : REGISTRATION_ACTION_COPY.registered;
}

function failureTitle(availability: RegistrationAvailability): string {
  if (availability.state === "registered") {
    return REGISTRATION_ACTION_COPY.withdrawFailed;
  }
  return availability.state === "open" && availability.action === "request"
    ? REGISTRATION_ACTION_COPY.requestFailed
    : REGISTRATION_ACTION_COPY.registerFailed;
}
