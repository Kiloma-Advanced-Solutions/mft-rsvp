"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";

import {
  Button,
  Checkbox,
  Field,
  FieldRow,
  Input,
  Select,
  Textarea,
  buttonClass,
  useToast,
} from "@/components/ui";
import { fetchJson } from "@/lib/api";
import { parseEventForm } from "@/lib/eventInput";
import type { EventFieldErrors, EventFormValues } from "@/lib/eventInput";
import {
  ACCESS_DESCRIPTIONS,
  ACCESS_LABELS,
  ACCESS_ORDER,
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  EVENT_FORM_LABELS,
  LOCATION_KIND_LABELS,
  MANAGE_ACTION_COPY,
  MANAGE_LABELS,
} from "@/lib/labels";
import type { EventLocation, EventRecord } from "@/lib/types";

import styles from "./EventForm.module.css";

/**
 * The one event form. Used by `/events/new` to create and by `/events/[id]` to
 * edit in place, so there is no second, near-identical edit screen anywhere.
 *
 * `mode` is the only difference between the two, and it decides exactly three
 * things: which endpoint to call, what the submit button says, and where a
 * success goes. Every field, every rule and all the layout are shared.
 *
 * It validates through `parseEventForm` from `lib/eventInput.ts` -- the same
 * function the route handlers run -- purely so a mistake can be shown next to
 * the field that caused it. The refusal that matters happens on the server,
 * which validates again and does not trust this having passed.
 *
 * Values are uncontrolled and read from the DOM at submit, the way
 * `BoardFilters` reads its form. The three pieces of state below are the ones
 * that change what is on screen rather than merely what will be sent.
 */
export function EventForm({
  mode,
  initialValues,
  goingCount,
}: {
  mode: { kind: "create" } | { kind: "edit"; eventId: string };
  /**
   * Computed on the server by `toFormValues()`, so the `datetime-local` strings
   * are never recomputed during a client render.
   */
  initialValues: EventFormValues;
  /** Only for the capacity hint when editing. */
  goingCount?: number;
}) {
  const [locationKind, setLocationKind] = useState(initialValues.locationKind);
  const [access, setAccess] = useState(initialValues.access);
  const [unlimited, setUnlimited] = useState(initialValues.capacity === "");

  const [errors, setErrors] = useState<EventFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [navigating, startTransition] = useTransition();

  const router = useRouter();
  const toast = useToast();

  const creating = mode.kind === "create";
  const cancelHref = creating ? "/events" : `/events/${mode.eventId}`;
  // Busy until the request has answered *and* the navigation has landed, so the
  // button cannot be clicked twice for one save.
  const busy = submitting || navigating;

  const showsVenue = locationKind === "in_person" || locationKind === "hybrid";
  const showsLink = locationKind === "online" || locationKind === "hybrid";

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    // Read the DOM synchronously: `currentTarget` is gone after the first await.
    const values = readForm(new FormData(formEvent.currentTarget));

    const parsed = parseEventForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setSubmitting(true);

    try {
      const { event } = await fetchJson<{ event: EventRecord }>(
        creating ? "/api/events" : `/api/events/${mode.eventId}`,
        {
          method: creating ? "POST" : "PATCH",
          body: JSON.stringify(parsed.value),
        },
      );

      toast.success(
        creating ? MANAGE_ACTION_COPY.created : MANAGE_ACTION_COPY.saved,
      );

      // Leaving edit mode drops `?edit=1`, so Back cannot return to a form for
      // an event that has already been saved. `replace` then `refresh` is what
      // makes the server-rendered view authoritative again.
      startTransition(() => {
        router.replace(`/events/${event.id}`, { scroll: false });
        router.refresh();
      });
    } catch (error) {
      // Stay here with the input intact -- unlike a registration, a refused
      // save has work in it that a refresh would throw away.
      const message = error instanceof Error ? error.message : undefined;
      setFormError(message ?? null);
      toast.error(
        creating
          ? MANAGE_ACTION_COPY.createFailed
          : MANAGE_ACTION_COPY.saveFailed,
        message,
      );
      setSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.fields}>
        <Field label={EVENT_FORM_LABELS.title} required error={errors.title}>
          <Input name="title" defaultValue={initialValues.title} />
        </Field>

        <Field
          label={EVENT_FORM_LABELS.summary}
          required
          hint={EVENT_FORM_LABELS.summaryHint}
          error={errors.summary}
        >
          <Input name="summary" defaultValue={initialValues.summary} />
        </Field>

        <Field
          label={EVENT_FORM_LABELS.description}
          required
          hint={EVENT_FORM_LABELS.descriptionHint}
          error={errors.description}
        >
          <Textarea
            name="description"
            rows={6}
            defaultValue={initialValues.description}
          />
        </Field>
      </div>

      <Section title={EVENT_FORM_LABELS.sectionWhen}>
        <FieldRow>
          <Field
            label={EVENT_FORM_LABELS.startsAt}
            required
            error={errors.startsAt}
          >
            <Input
              type="datetime-local"
              name="startsAt"
              defaultValue={initialValues.startsAt}
            />
          </Field>
          <Field label={EVENT_FORM_LABELS.endsAt} required error={errors.endsAt}>
            <Input
              type="datetime-local"
              name="endsAt"
              defaultValue={initialValues.endsAt}
            />
          </Field>
        </FieldRow>
      </Section>

      <Section title={EVENT_FORM_LABELS.sectionWhere}>
        <Field
          label={EVENT_FORM_LABELS.locationKind}
          required
          error={errors.location}
        >
          <Select
            name="locationKind"
            value={locationKind}
            onChange={(changed) => setLocationKind(changed.target.value)}
          >
            {LOCATION_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {LOCATION_KIND_LABELS[kind]}
              </option>
            ))}
          </Select>
        </Field>

        {/*
          Only the fields `EventLocation.kind` calls meaningful are rendered, and
          the parser drops the rest -- so a hybrid event switched to online does
          not keep its old street address.
        */}
        {showsVenue && (
          <FieldRow>
            <Field
              label={EVENT_FORM_LABELS.venue}
              required
              error={errors.locationVenue}
            >
              <Input
                name="locationVenue"
                defaultValue={initialValues.locationVenue}
              />
            </Field>
            <Field
              label={EVENT_FORM_LABELS.address}
              optional
              hint={EVENT_FORM_LABELS.addressHint}
            >
              <Input
                name="locationAddress"
                defaultValue={initialValues.locationAddress}
              />
            </Field>
          </FieldRow>
        )}

        {showsLink && (
          <FieldRow>
            <Field
              label={EVENT_FORM_LABELS.url}
              required
              error={errors.locationUrl}
            >
              <Input
                name="locationUrl"
                defaultValue={initialValues.locationUrl}
              />
            </Field>
            <Field
              label={EVENT_FORM_LABELS.platform}
              optional
              hint={EVENT_FORM_LABELS.platformHint}
            >
              <Input
                name="locationPlatform"
                defaultValue={initialValues.locationPlatform}
              />
            </Field>
          </FieldRow>
        )}
      </Section>

      <Section title={EVENT_FORM_LABELS.sectionWho}>
        <FieldRow>
          <Field
            label={EVENT_FORM_LABELS.category}
            required
            error={errors.category}
          >
            <Select name="category" defaultValue={initialValues.category}>
              <option value="">—</option>
              {CATEGORY_ORDER.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label={EVENT_FORM_LABELS.access}
            required
            hint={accessHint(access)}
            error={errors.access}
          >
            <Select
              name="access"
              value={access}
              onChange={(changed) => setAccess(changed.target.value)}
            >
              <option value="">—</option>
              {ACCESS_ORDER.map((option) => (
                <option key={option} value={option}>
                  {ACCESS_LABELS[option]}
                </option>
              ))}
            </Select>
          </Field>
        </FieldRow>

        <div className={styles.capacity}>
          <Checkbox
            label={EVENT_FORM_LABELS.capacityUnlimited}
            checked={unlimited}
            onChange={(changed) => setUnlimited(changed.target.checked)}
          />
          {!unlimited && (
            <Field
              label={EVENT_FORM_LABELS.capacity}
              hint={capacityHint(goingCount)}
              error={errors.capacity}
            >
              <Input
                type="number"
                min={1}
                step={1}
                name="capacity"
                placeholder={EVENT_FORM_LABELS.capacityPlaceholder}
                defaultValue={initialValues.capacity}
              />
            </Field>
          )}
        </div>
      </Section>

      {formError && (
        <p className={styles.formError} role="alert">
          {formError}
        </p>
      )}

      <div className={styles.actions}>
        {/*
          A link cannot be `disabled`, and `aria-disabled` alone still leaves it
          clickable -- which would abandon a save that is already in flight. So
          while busy it also leaves the tab order and stops taking pointer
          events, and `aria-disabled` is what tells assistive tech why.
        */}
        <Link
          href={cancelHref}
          className={buttonClass({
            variant: "ghost",
            className: busy ? styles.linkBusy : undefined,
          })}
          aria-disabled={busy}
          tabIndex={busy ? -1 : undefined}
        >
          {MANAGE_LABELS.cancel}
        </Link>
        <Button type="submit" loading={busy}>
          {creating ? MANAGE_LABELS.createSubmit : MANAGE_LABELS.editSubmit}
        </Button>
      </div>
    </form>
  );
}

const LOCATION_KINDS: EventLocation["kind"][] = [
  "in_person",
  "online",
  "hybrid",
];

/** Explains the chosen mode, and warns about the one that hides the event. */
function accessHint(access: string): string | undefined {
  const known = ACCESS_ORDER.find((option) => option === access);
  if (!known) return undefined;

  return known === "invite"
    ? `${ACCESS_DESCRIPTIONS[known]} ${EVENT_FORM_LABELS.accessInviteWarning}`
    : ACCESS_DESCRIPTIONS[known];
}

/**
 * Lowering capacity below the people already confirmed is allowed -- it does
 * not remove anybody -- so this says what is already true rather than refusing.
 */
function capacityHint(goingCount?: number): string {
  if (goingCount === undefined || goingCount === 0) {
    return EVENT_FORM_LABELS.capacityHint;
  }
  const people = goingCount === 1 ? "person has" : "people have";
  return `${goingCount} ${people} a confirmed place already.`;
}

/** One titled group of fields, so a long form still reads as sections. */
function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.fields}>{children}</div>
    </section>
  );
}

/**
 * The form's DOM, as the values the parser expects. A field that is not
 * rendered -- an address on an online event, a capacity that is unlimited --
 * is simply absent, and the empty string is what the parser reads as "not set".
 */
function readForm(data: FormData): EventFormValues {
  const read = (name: string): string => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };

  return {
    title: read("title"),
    summary: read("summary"),
    description: read("description"),
    startsAt: read("startsAt"),
    endsAt: read("endsAt"),
    category: read("category"),
    access: read("access"),
    capacity: read("capacity"),
    locationKind: read("locationKind"),
    locationVenue: read("locationVenue"),
    locationAddress: read("locationAddress"),
    locationUrl: read("locationUrl"),
    locationPlatform: read("locationPlatform"),
  };
}
