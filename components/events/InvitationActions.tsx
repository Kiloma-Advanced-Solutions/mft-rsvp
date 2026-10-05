"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  Button,
  Checkbox,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  useToast,
} from "@/components/ui";
import { fetchJson } from "@/lib/api";
import {
  INVITATION_ACTION_COPY,
  INVITATION_LABELS,
  REVOKE_INVITATION_DIALOG,
  invitationFailuresLabel,
  invitationsAddedLabel,
  invitationsFailedLabel,
  invitationsPartlyAddedLabel,
  inviteSelectedLabel,
  revokeInvitationDialogMessage,
  revokeInvitationLabel,
  selectedCountLabel,
} from "@/lib/labels";

import styles from "./InvitationList.module.css";

/**
 * The two interactive parts of the host's invitation list, and the only client
 * code in it. `InvitationList` renders them only from data `lib/events.ts`
 * builds for a viewer who may manage the event, so an ordinary viewer never
 * receives an invitee's id or a candidate.
 *
 * They decide nothing about whether an action is allowed. Who may be picked is
 * the `candidates` list the server worked out with `getInvitationAvailability()`;
 * whether a revoke button exists is `getInvitationRevocationAvailability()`;
 * and the route works both answers out again, under the event-row lock, before
 * it writes. A button is an affordance; the refusal that matters is the
 * server's.
 *
 * Both follow `AttendeeActions`: `fetchJson` with no body -- the actor is the
 * session, the event and the person are the URL -- a toast carrying the
 * server's own message, then `router.refresh()` inside a transition so the
 * server-rendered list becomes the truth again, after a failure as well as a
 * success. Busy until that refresh lands. No optimistic state. The picker sends
 * several such requests in a row and refreshes once after the last.
 */

type Candidate = { id: string; name: string; title: string };

/**
 * Tick several people and invite them with one click.
 *
 * The people are picked in a dialog, so the page holds one button, a count and
 * the send button however many candidates there are. Ticking applies at once;
 * closing the dialog keeps the ticks, and inviting happens from the page.
 *
 * Each person is still one invitation: the button walks the selection **one
 * request at a time** through the same per-person route a single invitation
 * uses, so every one of them is authorised, re-checked under the event-row lock
 * and written on its own. Sequential rather than parallel, because the requests
 * would queue on that one row anyway, and in this order the results line up
 * with the list.
 *
 * Best effort: a refusal for one person -- invited a moment ago by another
 * host, or the event closed to invitations mid-way -- does not stop or undo the
 * others. The server's own words come back, and one toast sums the batch up.
 * The list is refreshed once, after the last request, and the controls stay
 * busy until it lands.
 */
export function InvitePicker({
  eventId,
  candidates,
}: {
  eventId: string;
  /** Only who may be invited right now, already decided on the server. */
  candidates: Candidate[];
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const candidateArea = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const toast = useToast();

  const busy = submitting || refreshing;

  // The dialog is centred, so a list that shrinks as the search narrows it
  // would move the dialog -- and the field being typed in -- on every key.
  // Instead the list area keeps, for as long as the dialog is open, the height
  // the whole list had when it opened: a short list keeps its own short height,
  // a long one the part of the dialog's scrolling body it filled. Measured
  // rather than a fixed height, because that depends on how many people there
  // are, how their names wrap and the screen. It sizes this area only; where
  // the dialog sits is still the shared `Modal`'s.
  //
  // Runs after the `Modal`'s own effect has opened the dialog, so there is a
  // layout to measure; the search is always empty at this point, so it is the
  // whole list. Written to the element rather than kept in state: it changes
  // nothing React renders.
  useEffect(() => {
    const area = candidateArea.current;
    // `Modal` renders its children straight into its scrolling body.
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

  // A tick lasts only as long as the server still offers the person. A refresh
  // can take somebody out of `candidates` -- another host invited them first,
  // say -- and their tick goes with them, so if they are offered again later (a
  // revoke on this page) they come back unticked, to be chosen afresh. Done
  // while rendering, the way React adjusts state to a changed prop, so no
  // render ever shows the old tick. Keyed on the ids rather than the array, so
  // only a real change to who is offered prunes anything; the search filter
  // never reaches it, because it is about `candidates`, not what is visible.
  const candidateIds = candidates.map((candidate) => candidate.id).join(" ");
  const [offeredIds, setOfferedIds] = useState(candidateIds);
  if (offeredIds !== candidateIds) {
    setOfferedIds(candidateIds);
    setSelected((current) =>
      current.filter((id) =>
        candidates.some((candidate) => candidate.id === id),
      ),
    );
  }

  // Only ticks the server still offers count. Between a refresh and the
  // pruning above there is no render to see, but this keeps the count and the
  // requests honest on their own: a tick on a person the list no longer shows
  // is no tick -- not counted and not sent.
  // In list order, so the requests go out in the order the host sees.
  const chosen = candidates.filter((candidate) =>
    selected.includes(candidate.id),
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

  async function invite() {
    if (chosen.length === 0) return;
    setSubmitting(true);

    const invited = new Set<string>();
    const failures: { name: string; message: string }[] = [];

    try {
      for (const candidate of chosen) {
        try {
          await fetchJson(
            `/api/events/${eventId}/invitations/${candidate.id}`,
            { method: "POST" },
          );
          invited.add(candidate.id);
        } catch (error) {
          failures.push({
            name: candidate.name,
            message: error instanceof Error ? error.message : "",
          });
        }
      }
    } finally {
      if (failures.length === 0) {
        toast.success(invitationsAddedLabel(invited.size));
      } else {
        toast.error(
          invited.size > 0
            ? invitationsPartlyAddedLabel(invited.size, chosen.length)
            : invitationsFailedLabel(chosen.length),
          invitationFailuresLabel(failures),
        );
      }

      // Whoever was invited leaves the selection now, so a second click cannot
      // send them again. Whoever was refused stays ticked for a retry -- and if
      // the refresh shows they can no longer be invited, `chosen` drops them.
      setSelected((current) => current.filter((id) => !invited.has(id)));
      setSubmitting(false);
      startTransition(() => router.refresh());
    }
  }

  // The filter only narrows what the dialog shows. It never touches `selected`,
  // so somebody ticked and then filtered out is still counted and still sent.
  const query = filter.trim().toLocaleLowerCase();
  const visible =
    query === ""
      ? candidates
      : candidates.filter(
          (candidate) =>
            candidate.name.toLocaleLowerCase().includes(query) ||
            candidate.title.toLocaleLowerCase().includes(query),
        );

  // Every way out -- "סיום", Escape, the backdrop -- keeps the selection and
  // forgets the search, so the next opening shows the whole list again.
  function closePicker() {
    setPickerOpen(false);
    setFilter("");
  }

  return (
    <div className={styles.picker}>
      <p className={styles.pickerLabel}>{INVITATION_LABELS.pickerLabel}</p>
      <Button
        variant="secondary"
        onClick={() => setPickerOpen(true)}
        disabled={busy}
        aria-haspopup="dialog"
      >
        {INVITATION_LABELS.choosePeople}
      </Button>

      <div className={styles.pickerFooter}>
        <p className={styles.note} aria-live="polite">
          {selectedCountLabel(chosen.length)}
        </p>
        <Button
          onClick={invite}
          loading={submitting}
          disabled={chosen.length === 0 || busy}
        >
          {chosen.length === 0
            ? INVITATION_LABELS.invite
            : inviteSelectedLabel(chosen.length)}
        </Button>
      </div>

      {/*
        The shared `Modal`: the native dialog gives focus trapping, Escape, the
        backdrop and focus returning to the button above. Its body scrolls, so
        a long list stays inside it rather than lengthening the page.
      */}
      <Modal
        open={pickerOpen}
        onClose={closePicker}
        title={INVITATION_LABELS.pickerTitle}
        description={INVITATION_LABELS.pickerDescription}
        footer={
          <>
            <p className={styles.dialogCount} aria-live="polite">
              {selectedCountLabel(chosen.length)}
            </p>
            <Button onClick={closePicker}>{INVITATION_LABELS.done}</Button>
          </>
        }
      >
        <div className={styles.filter}>
          <Field label={INVITATION_LABELS.filterLabel}>
            {/*
              A plain text field rather than `type="search"`: in a search field
              the browser spends the first Escape clearing the text, so it would
              take two to close the dialog. Closing clears the filter anyway.

              No `dir="auto"`, unlike the event form: this is a query, not
              text that is kept, and an empty `auto` field resolves to
              left-to-right, which put the Hebrew placeholder on the left. It
              keeps the page's right-to-left; a Latin name typed into it still
              reads left to right.
            */}
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={INVITATION_LABELS.filterPlaceholder}
            />
          </Field>
        </div>

        <div ref={candidateArea}>
          <div
            className={styles.candidateList}
            role="group"
            aria-label={INVITATION_LABELS.pickerLabel}
          >
            {visible.map((candidate) => (
              <Checkbox
                key={candidate.id}
                checked={selected.includes(candidate.id)}
                onChange={(event) => toggle(candidate.id, event.target.checked)}
                label={<span dir="auto">{candidate.name}</span>}
                hint={<span dir="auto">{candidate.title}</span>}
              />
            ))}
          </div>

          {visible.length === 0 && (
            <p className={styles.note}>{INVITATION_LABELS.noMatches}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

/**
 * Revoke one invitation, always behind a confirmation: it hides the event from
 * the person, and once the event has started or been cancelled it cannot be
 * given back. The dialog says what it leaves alone too -- their registration,
 * and any place they hold.
 */
export function RevokeInvitationButton({
  eventId,
  userId,
  inviteeName,
  reinviteClosed,
}: {
  eventId: string;
  userId: string;
  /** For the accessible name and the dialog. */
  inviteeName: string;
  /** No new invitations can be added, so this one could not be given back. */
  reinviteClosed: boolean;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [refreshing, startTransition] = useTransition();
  const router = useRouter();
  const toast = useToast();

  const busy = submitting || refreshing;

  async function revoke() {
    setSubmitting(true);
    try {
      await fetchJson(`/api/events/${eventId}/invitations/${userId}`, {
        method: "DELETE",
      });
      toast.success(INVITATION_ACTION_COPY.revoked);
    } catch (error) {
      toast.error(
        INVITATION_ACTION_COPY.revokeFailed,
        error instanceof Error ? error.message : undefined,
      );
    } finally {
      // Closed after a failure too, as the remove dialog is: a refusal means
      // the list moved, and the refresh below is what shows how.
      setSubmitting(false);
      setConfirmOpen(false);
      startTransition(() => router.refresh());
    }
  }

  return (
    <>
      <Button
        variant="dangerGhost"
        size="sm"
        onClick={() => setConfirmOpen(true)}
        disabled={busy}
        aria-label={revokeInvitationLabel(inviteeName)}
      >
        {INVITATION_LABELS.revoke}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={revoke}
        title={REVOKE_INVITATION_DIALOG.title}
        message={revokeInvitationDialogMessage(inviteeName, reinviteClosed)}
        confirmLabel={REVOKE_INVITATION_DIALOG.confirm}
        cancelLabel={REVOKE_INVITATION_DIALOG.cancel}
        destructive
        // Also makes the dialog undismissable mid-request.
        loading={submitting}
      />
    </>
  );
}
