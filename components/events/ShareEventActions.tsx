"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button, Checkbox, Field, Input, Modal, useToast } from "@/components/ui";
import { RequestError, fetchJson } from "@/lib/api";
import {
  SHARE_EMAIL_LABELS,
  SHARE_LABELS,
  invitationFailuresLabel,
  selectedCountLabel,
  sendShareEmailsLabel,
  shareEmailsFailedLabel,
  shareEmailsPartlySentLabel,
  shareEmailsSentLabel,
} from "@/lib/labels";

import styles from "./ShareEventActions.module.css";

/**
 * The host's way of handing an event to somebody: copy its link.
 *
 * Interaction only. Whether sharing is on offer, and the URL itself, are worked
 * out on the server -- the page renders this only for someone
 * `canManageEvent()` allows, only while `getSharingAvailability()` is open, and
 * only with a URL `buildEventShareUrl()` produced. Nothing here builds a URL or
 * reads `window.location`.
 *
 * The link grants nothing, so this is not an authorisation boundary either: a
 * member who copies the address bar has the same URL and the same access.
 *
 * Copying changes no server state, so unlike the other host actions there is no
 * `router.refresh()`. A clipboard refusal -- a denied permission, or an origin
 * that is not a secure context once deployed -- is reported, and the URL is
 * shown in a read-only field so the host can still copy it by hand.
 */
export function ShareEventActions({ eventUrl }: { eventUrl: string }) {
  const [showField, setShowField] = useState(false);
  const toast = useToast();

  async function copy() {
    try {
      // Absent outside a secure context, so it fails here rather than later.
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(eventUrl);
      toast.success(SHARE_LABELS.copied);
    } catch {
      toast.error(SHARE_LABELS.copyFailed, SHARE_LABELS.copyFailedHint);
      setShowField(true);
    }
  }

  return (
    <div className={styles.share}>
      <Button variant="secondary" size="sm" onClick={copy}>
        {SHARE_LABELS.copyLink}
      </Button>
      <p className={styles.hint}>{SHARE_LABELS.hint}</p>

      {showField && (
        <Field label={SHARE_LABELS.linkField} className={styles.field}>
          <Input
            readOnly
            value={eventUrl}
            // A URL is left-to-right; `auto` lets the content say so rather
            // than overriding the document's direction.
            dir="auto"
            // Selected on focus, so one keystroke copies it.
            onFocus={(event) => event.currentTarget.select()}
          />
        </Field>
      )}
    </div>
  );
}

type Recipient = { id: string; name: string; title: string };

/**
 * Pick people who can already see the event and email each of them its link.
 *
 * Mirrors the invitation picker (`InvitePicker`): the people are ticked in a
 * dialog, and the button walks the selection **one request at a time** through
 * the per-person route, so every send is authorised and re-checked on its own
 * and the results line up with the list. Best effort -- one refusal does not
 * stop the others -- and one toast sums the batch up, never calling a partial
 * batch a success. Nothing is retried automatically: a send that timed out may
 * still have been delivered, and a second email is the host's call.
 *
 * Who is offered was decided on the server (`shareRecipients`): only people
 * who can already see the event, never the host. That list is an affordance;
 * the route asks every question again before it sends.
 *
 * Unlike the invitation picker, a successful send changes nothing the page
 * shows, so it does not refresh. A refusal (4xx) means the page was out of date
 * -- the event closed to sharing, or someone lost sight of it -- so the page
 * refreshes then. A failure of the mail service itself (5xx) refreshes
 * nothing: the page was right, the email simply did not go.
 */
export function ShareEmailPicker({
  eventId,
  recipients,
}: {
  eventId: string;
  recipients: Recipient[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const recipientArea = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();

  const busy = sending || refreshing;

  // Keeps the dialog from jumping as the search narrows the list -- the same
  // measurement `InvitePicker` makes, for the same reason.
  useEffect(() => {
    const area = recipientArea.current;
    const body = area?.parentElement;
    if (!area || !body) return;

    area.style.minHeight = "";
    if (!pickerOpen) return;

    const visible =
      body.clientHeight -
      parseFloat(getComputedStyle(body).paddingBottom) -
      (area.offsetTop - body.offsetTop);
    area.style.minHeight = `${Math.min(area.offsetHeight, visible)}px`;
  }, [pickerOpen]);

  // A tick lasts only as long as the server still offers the person: after a
  // refresh, anybody no longer eligible leaves the selection.
  const recipientIds = recipients.map((recipient) => recipient.id).join(" ");
  const [offeredIds, setOfferedIds] = useState(recipientIds);
  if (offeredIds !== recipientIds) {
    setOfferedIds(recipientIds);
    setSelected((current) =>
      current.filter((id) => recipients.some((recipient) => recipient.id === id)),
    );
  }

  // In list order, so the requests go out in the order the host sees.
  const chosen = recipients.filter((recipient) =>
    selected.includes(recipient.id),
  );

  function toggle(id: string, checked: boolean) {
    setSelected((current) =>
      checked
        ? current.includes(id)
          ? current
          : [...current, id]
        : current.filter((selectedId) => selectedId !== id),
    );
  }

  async function send() {
    if (chosen.length === 0 || busy) return;
    setSending(true);

    const sent = new Set<string>();
    const failures: { name: string; message: string }[] = [];
    let stale = false;

    try {
      for (const recipient of chosen) {
        try {
          // No body: the route reads the address, the names and the link on
          // the server.
          await fetchJson(`/api/events/${eventId}/share-emails/${recipient.id}`, {
            method: "POST",
          });
          sent.add(recipient.id);
        } catch (error) {
          if (
            error instanceof RequestError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            stale = true;
          }
          failures.push({
            name: recipient.name,
            message: error instanceof Error ? error.message : "",
          });
        }
      }
    } finally {
      if (failures.length === 0) {
        toast.success(shareEmailsSentLabel(sent.size));
      } else {
        toast.error(
          sent.size > 0
            ? shareEmailsPartlySentLabel(sent.size, chosen.length)
            : shareEmailsFailedLabel(chosen.length),
          invitationFailuresLabel(failures),
        );
      }

      // Whoever was emailed leaves the selection, so a second click cannot
      // email them again; whoever was not stays ticked for the host to retry.
      setSelected((current) => current.filter((id) => !sent.has(id)));
      setSending(false);
      if (stale) startTransition(() => router.refresh());
    }
  }

  const query = filter.trim().toLocaleLowerCase();
  const visible =
    query === ""
      ? recipients
      : recipients.filter(
          (recipient) =>
            recipient.name.toLocaleLowerCase().includes(query) ||
            recipient.title.toLocaleLowerCase().includes(query),
        );

  function closePicker() {
    setPickerOpen(false);
    setFilter("");
  }

  // Nobody but the host can see the event -- a new invite-only one, say. Say
  // so instead of offering a dialog with nobody in it.
  if (recipients.length === 0) {
    return (
      <div className={styles.share}>
        <p className={styles.pickerLabel}>{SHARE_EMAIL_LABELS.pickerLabel}</p>
        <p className={styles.hint}>{SHARE_EMAIL_LABELS.noRecipients}</p>
      </div>
    );
  }

  return (
    <div className={styles.share}>
      <p className={styles.pickerLabel}>{SHARE_EMAIL_LABELS.pickerLabel}</p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setPickerOpen(true)}
        disabled={busy}
        aria-haspopup="dialog"
      >
        {SHARE_EMAIL_LABELS.choosePeople}
      </Button>
      <p className={styles.hint}>{SHARE_EMAIL_LABELS.hint}</p>

      <div className={styles.pickerFooter}>
        <p className={styles.hint} aria-live="polite">
          {selectedCountLabel(chosen.length)}
        </p>
        <Button
          size="sm"
          onClick={send}
          loading={sending}
          disabled={chosen.length === 0 || busy}
        >
          {chosen.length === 0
            ? SHARE_EMAIL_LABELS.send
            : sendShareEmailsLabel(chosen.length)}
        </Button>
      </div>

      <Modal
        open={pickerOpen}
        onClose={closePicker}
        title={SHARE_EMAIL_LABELS.pickerTitle}
        description={SHARE_EMAIL_LABELS.pickerDescription}
        footer={
          <>
            <p className={styles.dialogCount} aria-live="polite">
              {selectedCountLabel(chosen.length)}
            </p>
            <Button onClick={closePicker}>{SHARE_EMAIL_LABELS.done}</Button>
          </>
        }
      >
        <div className={styles.filter}>
          <Field label={SHARE_EMAIL_LABELS.filterLabel}>
            {/* No `dir="auto"`, as in the invitation picker: it is a query. */}
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={SHARE_EMAIL_LABELS.filterPlaceholder}
            />
          </Field>
        </div>

        <div ref={recipientArea}>
          <div
            className={styles.recipientList}
            role="group"
            aria-label={SHARE_EMAIL_LABELS.pickerTitle}
          >
            {visible.map((recipient) => (
              <Checkbox
                key={recipient.id}
                checked={selected.includes(recipient.id)}
                onChange={(event) => toggle(recipient.id, event.target.checked)}
                label={<span dir="auto">{recipient.name}</span>}
                hint={<span dir="auto">{recipient.title}</span>}
              />
            ))}
          </div>

          {visible.length === 0 && (
            <p className={styles.hint}>{SHARE_EMAIL_LABELS.noMatches}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
