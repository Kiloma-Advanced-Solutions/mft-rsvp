"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  ActionMenu,
  Button,
  Checkbox,
  Field,
  Input,
  Modal,
  useToast,
} from "@/components/ui";
import type { ActionMenuItem } from "@/components/ui";
import { RequestError, fetchJson } from "@/lib/api";
import {
  DETAIL_LABELS,
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

/** Somebody the host may email the link to: no address, which stays on the server. */
type ShareRecipient = { id: string; name: string; title: string };

/** A batch that did not all go out: its headline and who was refused, and why. */
type BatchFailure = { title: string; detail: string };

/**
 * What the page decided about sharing, on the server: open, with the finished
 * URL and the people who can already see the event, or closed, with the
 * sentence that says why -- a draft, a cancelled or started event, or a base
 * URL this server was never given.
 */
export type ShareState =
  | { state: "open"; url: string; recipients: ShareRecipient[] }
  | { state: "closed"; note: string };

/**
 * The header's Share menu: copy the event's link, or email it.
 *
 * Interaction only. Whether sharing is on offer, the URL itself and who may be
 * emailed are all worked out on the server -- the page renders this only for
 * someone `canManageEvent()` allows, from `getSharingAvailability()`,
 * `buildEventShareUrl()` and the loader's `shareRecipients`. Nothing here
 * builds a URL or reads `window.location`.
 *
 * The link grants nothing, so this is not an authorisation boundary either: a
 * member who copies the address bar has the same URL and the same access.
 *
 * When sharing is closed the menu still opens, on its copy item, disabled,
 * with the reason under it. With nobody to email, the email item is disabled
 * the same way.
 *
 * Copying changes no server state, so there is no `router.refresh()`. A
 * clipboard refusal -- a denied permission, or an origin that is not a secure
 * context once deployed -- is reported, and the URL opens in a dialog, in a
 * read-only field, selected, so the host can still copy it by hand.
 */
export function ShareMenu({
  eventId,
  share,
}: {
  eventId: string;
  share: ShareState;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const toast = useToast();

  async function copy(url: string) {
    try {
      // Absent outside a secure context, so it fails here rather than later.
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(url);
      toast.success(SHARE_LABELS.copied);
    } catch {
      toast.error(SHARE_LABELS.copyFailed, SHARE_LABELS.copyFailedHint);
      setLinkOpen(true);
    }
  }

  const items: ActionMenuItem[] =
    share.state === "closed"
      ? [
          {
            id: "copy",
            label: SHARE_LABELS.copyLink,
            icon: "link",
            disabled: true,
            note: share.note,
          },
        ]
      : [
          {
            id: "copy",
            label: SHARE_LABELS.copyLink,
            icon: "link",
            onSelect: () => copy(share.url),
          },
          {
            id: "email",
            label: SHARE_EMAIL_LABELS.menuItem,
            icon: "mail",
            disabled: share.recipients.length === 0,
            note:
              share.recipients.length === 0
                ? SHARE_EMAIL_LABELS.noRecipients
                : undefined,
            onSelect: () => setEmailOpen(true),
          },
        ];

  return (
    <>
      <ActionMenu
        icon="share"
        label={DETAIL_LABELS.share}
        items={items}
        note={share.state === "open" ? SHARE_LABELS.hint : undefined}
      />

      {share.state === "open" && (
        <>
          <Modal
            open={linkOpen}
            onClose={() => setLinkOpen(false)}
            title={SHARE_LABELS.linkField}
            size="sm"
          >
            <Input
              readOnly
              value={share.url}
              aria-label={SHARE_LABELS.linkField}
              // A URL is left-to-right; `auto` lets the content say so rather
              // than overriding the document's direction.
              dir="auto"
              // Focused on opening and selected on focus, so one keystroke
              // copies it.
              data-initial-focus
              onFocus={(event) => event.currentTarget.select()}
            />
          </Modal>

          <ShareEmailDialog
            open={emailOpen}
            onClose={() => setEmailOpen(false)}
            eventId={eventId}
            recipients={share.recipients}
          />
        </>
      )}
    </>
  );
}

/**
 * Pick people who can already see the event and email each of them its link,
 * in one dialog: the ticks, the count and the button that sends them.
 *
 * Mirrors the invitation picker (`InvitePicker`): the button walks the
 * selection **one request at a time** through the per-person route, so every
 * send is authorised and re-checked on its own and the results line up with
 * the list. Best effort -- one refusal does not stop the others -- and one
 * toast sums the batch up, never calling a partial batch a success. Nothing is
 * retried automatically: a send that timed out may still have been delivered,
 * and a second email is the host's call.
 *
 * When every send went, the dialog closes. When any failed, it stays open with
 * only the failed people still ticked, so sending again reaches them and
 * nobody who already has the email. It cannot be dismissed while a batch is
 * going out.
 *
 * Who is offered was decided on the server: only people who can already see
 * the event, never the host. That list is an affordance; the route asks every
 * question again before it sends.
 *
 * A successful send changes nothing the page shows, so it does not refresh. A
 * refusal (4xx) means the page was out of date -- the event closed to sharing,
 * or someone lost sight of it -- so the page refreshes then. A failure of the
 * mail service itself (5xx) refreshes nothing: the page was right, the email
 * simply did not go.
 */
function ShareEmailDialog({
  open,
  onClose,
  eventId,
  recipients,
}: {
  open: boolean;
  onClose: () => void;
  eventId: string;
  recipients: ShareRecipient[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [sending, setSending] = useState(false);
  // The last batch's refusals, shown inside the dialog: the toasts live
  // outside it, where a native modal leaves them inert and under its backdrop.
  const [failure, setFailure] = useState<BatchFailure | null>(null);
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
    if (!open) return;

    const visible =
      body.clientHeight -
      parseFloat(getComputedStyle(body).paddingBottom) -
      (area.offsetTop - body.offsetTop);
    area.style.minHeight = `${Math.min(area.offsetHeight, visible)}px`;
  }, [open]);

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

  function close() {
    onClose();
    setFilter("");
    setFailure(null);
  }

  async function send() {
    if (chosen.length === 0 || busy) return;
    setSending(true);
    setFailure(null);

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
        const summary = {
          title:
            sent.size > 0
              ? shareEmailsPartlySentLabel(sent.size, chosen.length)
              : shareEmailsFailedLabel(chosen.length),
          detail: invitationFailuresLabel(failures),
        };
        toast.error(summary.title, summary.detail);
        setFailure(summary);
      }

      // Whoever was emailed leaves the selection, so a second click cannot
      // email them again; whoever was not stays ticked for the host to retry.
      setSelected((current) => current.filter((id) => !sent.has(id)));
      setSending(false);
      if (failures.length === 0) close();
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

  return (
    <Modal
      open={open}
      onClose={close}
      title={SHARE_EMAIL_LABELS.pickerTitle}
      description={`${SHARE_EMAIL_LABELS.pickerDescription} ${SHARE_EMAIL_LABELS.hint}`}
      // A batch that is going out finishes before the dialog can go.
      dismissible={!sending}
      footer={
        <div className={styles.dialogFooter}>
          <div className={styles.dialogActions}>
            <Button
              onClick={send}
              loading={sending}
              disabled={chosen.length === 0 || busy}
            >
              {chosen.length === 0
                ? SHARE_EMAIL_LABELS.send
                : sendShareEmailsLabel(chosen.length)}
            </Button>
            <Button variant="secondary" onClick={close} disabled={sending}>
              {SHARE_EMAIL_LABELS.done}
            </Button>
          </div>
          <p className={styles.dialogCount} aria-live="polite">
            {selectedCountLabel(chosen.length)}
          </p>
        </div>
      }
    >
      {/*
        The same words as the toast, inside the dialog, where a screen reader
        can reach them and hears them as they appear. Cleared by the next send
        and by closing.
      */}
      {failure && (
        <div role="alert" className={styles.failure}>
          <p className={styles.failureTitle}>{failure.title}</p>
          <p>{failure.detail}</p>
        </div>
      )}

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
              disabled={sending}
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
  );
}
