"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import type { FormEvent, ReactNode } from "react";

import {
  Button,
  Card,
  Checkbox,
  Chip,
  Field,
  FieldRow,
  Icon,
  Input,
  SegmentedControl,
  Textarea,
  buttonClass,
  useToast,
} from "@/components/ui";
import { RequestError, fetchJson } from "@/lib/api";
import { cx } from "@/lib/cx";
import { toDateTimeLocalValue } from "@/lib/date";
import { UNLIMITED, parseEventForm, readFieldErrors } from "@/lib/eventInput";
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
  scheduleRefusalNote,
} from "@/lib/labels";
import { isStartInFuture } from "@/lib/permissions";
import type {
  EventLocation,
  EventRecord,
  ScheduleLockReason,
} from "@/lib/types";

import { ACCESS_ICONS, categoryToneClass } from "./EventMeta";
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
 * Values are uncontrolled and read from the DOM at submit. The three pieces of
 * state below are the ones that change what is on screen rather than merely
 * what will be sent.
 */
export function EventForm({
  mode,
  initialValues,
  scheduleLock,
}: {
  mode: { kind: "create" } | { kind: "edit"; eventId: string };
  /**
   * Computed on the server by `toFormValues()`, so the `datetime-local` strings
   * are never recomputed during a client render.
   */
  initialValues: EventFormValues;
  /**
   * Set when editing an event whose dates may no longer change, decided on the
   * server by `getScheduleAvailability()`. The two date inputs are disabled,
   * say why, and are left out of the request so the stored dates stand.
   *
   * Carries the stored timestamps exactly, because those -- not the
   * minute-rounded `initialValues` -- are what the locked dates are validated
   * as: a start and end seconds apart in the same minute display identically,
   * and would otherwise read as an end that is not after the start.
   */
  scheduleLock?: {
    reason: ScheduleLockReason;
    startsAt: string;
    endsAt: string;
  };
}) {
  const [locationKind, setLocationKind] = useState(initialValues.locationKind);
  const [category, setCategory] = useState(initialValues.category);
  const [access, setAccess] = useState(initialValues.access);
  // The hint or error under each set of choices, which the choices point at.
  const messageIds = {
    locationKind: useId(),
    category: useId(),
    access: useId(),
  };
  const [unlimited, setUnlimited] = useState(
    initialValues.capacityUnlimited !== "",
  );

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

  const datesLocked = scheduleLock !== undefined;
  const dateHint = scheduleLock ? (
    <span className={styles.lockNote}>
      <Icon name="lock" size="sm" />
      {scheduleRefusalNote(scheduleLock.reason)}
    </span>
  ) : undefined;

  async function submit(formEvent: FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    // Read the DOM synchronously: `currentTarget` is gone after the first await.
    const values = readForm(new FormData(formEvent.currentTarget));

    // A disabled input is not submitted, so locked dates would read as blank.
    // Validate against the exact stored timestamps instead -- they are not
    // sent, so the stored dates are what the server keeps.
    if (scheduleLock) {
      values.startsAt = scheduleLock.startsAt;
      values.endsAt = scheduleLock.endsAt;
    }

    const parsed = parseEventForm(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      setFormError(null);
      return;
    }

    // The schedule rule's one check the browser can make on its own: a start
    // that was changed has to be in the future. The server checks again against
    // its own clock and the stored event, and its answer is the one that counts.
    if (
      !datesLocked &&
      values.startsAt !== initialValues.startsAt &&
      !isStartInFuture(parsed.value.startsAt, Date.now())
    ) {
      setErrors({ startsAt: scheduleRefusalNote("start_not_future") });
      setFormError(null);
      return;
    }

    setErrors({});
    setFormError(null);
    setSubmitting(true);

    const payload: Partial<typeof parsed.value> = { ...parsed.value };
    if (datesLocked) {
      delete payload.startsAt;
      delete payload.endsAt;
    }

    try {
      const { event } = await fetchJson<{ event: EventRecord }>(
        creating ? "/api/events" : `/api/events/${mode.eventId}`,
        {
          method: creating ? "POST" : "PATCH",
          body: JSON.stringify(payload),
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
      // Put whatever the server named against its field, as the browser's own
      // checks would; the general message and the toast stay as they were.
      if (error instanceof RequestError) {
        setErrors(readFieldErrors(error.details));
      }
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
      {/*
        The details have no section title of their own: they are what the
        page is about, and the form never named them.
      */}
      <Card>
        <div className={styles.fields}>
          {/*
            The free-text controls take their direction from what is typed into
            them rather than from the document. The interface is Hebrew, but an
            event's title or venue may not be, and an RTL text box puts an
            English sentence's full stop at the wrong end. The structured
            controls -- the dates, the capacity, the pickers -- are left alone.
          */}
          <Field label={EVENT_FORM_LABELS.title} required error={errors.title}>
            <Input
              name="title"
              defaultValue={initialValues.title}
              dir="auto"
              aria-invalid={invalid(errors.title)}
            />
          </Field>

          <Field
            label={EVENT_FORM_LABELS.summary}
            required
            hint={EVENT_FORM_LABELS.summaryHint}
            error={errors.summary}
          >
            <Input
              name="summary"
              defaultValue={initialValues.summary}
              dir="auto"
              aria-invalid={invalid(errors.summary)}
            />
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
              dir="auto"
              aria-invalid={invalid(errors.description)}
            />
          </Field>
        </div>
      </Card>

      <Section title={EVENT_FORM_LABELS.sectionWhen}>
        <FieldRow>
          <Field
            label={EVENT_FORM_LABELS.startsAt}
            required
            hint={dateHint}
            error={errors.startsAt}
          >
            <Input
              type="datetime-local"
              name="startsAt"
              defaultValue={initialValues.startsAt}
              disabled={datesLocked}
              aria-invalid={invalid(errors.startsAt)}
              // The earliest start the picker offers, from the browser's clock
              // at the moment it is used. Set on focus rather than rendered, so
              // the server's markup never carries a time the client disagrees
              // with.
              onFocus={(focused) => {
                focused.currentTarget.min = toDateTimeLocalValue(
                  new Date().toISOString(),
                );
              }}
            />
          </Field>
          <Field
            label={EVENT_FORM_LABELS.endsAt}
            required
            hint={dateHint}
            error={errors.endsAt}
          >
            <Input
              type="datetime-local"
              name="endsAt"
              defaultValue={initialValues.endsAt}
              disabled={datesLocked}
              aria-invalid={invalid(errors.endsAt)}
            />
          </Field>
        </FieldRow>
      </Section>

      <Section title={EVENT_FORM_LABELS.sectionWhere}>
        {/*
          The three choices below are radios, not menus: every option shows,
          and each set submits under the same name the select it replaced did.
        */}
        <Field
          label={EVENT_FORM_LABELS.locationKind}
          required
          error={errors.location}
          group
          messageId={messageIds.locationKind}
        >
          <SegmentedControl<string>
            name="locationKind"
            fullWidth
            options={LOCATION_KINDS.map((kind) => ({
              value: kind,
              label: LOCATION_KIND_LABELS[kind],
            }))}
            value={locationKind}
            onChange={setLocationKind}
            invalid={Boolean(errors.location)}
            describedBy={errors.location ? messageIds.locationKind : undefined}
          />
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
                dir="auto"
                aria-invalid={invalid(errors.locationVenue)}
              />
            </Field>
            <Field label={EVENT_FORM_LABELS.address} optional>
              <Input
                name="locationAddress"
                defaultValue={initialValues.locationAddress}
                dir="auto"
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
                dir="auto"
                aria-invalid={invalid(errors.locationUrl)}
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
                dir="auto"
              />
            </Field>
          </FieldRow>
        )}
      </Section>

      <Section title={EVENT_FORM_LABELS.sectionWho}>
        {/*
          No category is chosen on a new event -- the select's "—" -- so none
          of these is checked, nothing is submitted, and the rule asks for one.
        */}
        <Field
          label={EVENT_FORM_LABELS.category}
          required
          error={errors.category}
          group
          messageId={messageIds.category}
        >
          <div
            className={styles.chips}
            role="radiogroup"
            aria-invalid={invalid(errors.category)}
          >
            {CATEGORY_ORDER.map((option) => (
              <Chip
                key={option}
                name="category"
                value={option}
                selected={category === option}
                onChange={setCategory}
                dot
                className={cx(styles.categoryChip, categoryToneClass(option))}
                invalid={Boolean(errors.category)}
                describedBy={errors.category ? messageIds.category : undefined}
              >
                {CATEGORY_LABELS[option]}
              </Chip>
            ))}
          </div>
        </Field>

        <Field
          label={EVENT_FORM_LABELS.access}
          required
          hint={accessHint(access)}
          error={errors.access}
          group
          messageId={messageIds.access}
        >
          <SegmentedControl<string>
            name="access"
            fullWidth
            options={ACCESS_ORDER.map((option) => ({
              value: option,
              label: (
                <>
                  <Icon name={ACCESS_ICONS[option]} size="sm" />
                  {ACCESS_LABELS[option]}
                </>
              ),
            }))}
            value={access}
            onChange={setAccess}
            invalid={Boolean(errors.access)}
            describedBy={
              errors.access || accessHint(access) ? messageIds.access : undefined
            }
          />
        </Field>

        <div className={styles.capacity}>
          <Checkbox
            // Submitted, not merely local state: `capacity: null` now requires
            // this to be ticked, so clearing the number box below cannot be
            // mistaken for choosing "no limit".
            name="capacityUnlimited"
            value={UNLIMITED}
            label={EVENT_FORM_LABELS.capacityUnlimited}
            checked={unlimited}
            onChange={(changed) => setUnlimited(changed.target.checked)}
          />
          {!unlimited && (
            <div className={styles.capacityField}>
              <Field label={EVENT_FORM_LABELS.capacity} error={errors.capacity}>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  name="capacity"
                  placeholder={EVENT_FORM_LABELS.capacityPlaceholder}
                  defaultValue={initialValues.capacity}
                  aria-invalid={invalid(errors.capacity)}
                />
              </Field>
            </div>
          )}
        </div>
      </Section>

      {formError && (
        <p className={styles.formError} role="alert">
          <span className={styles.formErrorDot} aria-hidden />
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
            size: "lg",
            className: busy ? styles.linkBusy : undefined,
          })}
          aria-disabled={busy}
          tabIndex={busy ? -1 : undefined}
        >
          {MANAGE_LABELS.cancel}
        </Link>
        <Button type="submit" size="lg" loading={busy}>
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
 * `aria-invalid` for a control whose field has an error, and nothing
 * otherwise. The message itself is announced by `Field`, inside the label.
 */
function invalid(error: string | undefined): true | undefined {
  return error ? true : undefined;
}

/**
 * One titled group of fields on a section card of its own, as the detail page
 * sets out its sections, so a long form still reads as parts.
 */
function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <section>
        <h2 className={styles.sectionTitle}>{title}</h2>
        <div className={styles.fields}>{children}</div>
      </section>
    </Card>
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
    capacityUnlimited: read("capacityUnlimited"),
    locationKind: read("locationKind"),
    locationVenue: read("locationVenue"),
    locationAddress: read("locationAddress"),
    locationUrl: read("locationUrl"),
    locationPlatform: read("locationPlatform"),
  };
}
