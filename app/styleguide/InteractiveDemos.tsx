"use client";

import { useState } from "react";

import {
  Button,
  ConfirmDialog,
  Field,
  Input,
  Modal,
  SegmentedControl,
  useToast,
} from "@/components/ui";

import styles from "./styleguide.module.css";

/**
 * The parts of the kit that need state to show anything. Kept in its own client
 * island so the style guide page itself stays a Server Component.
 */
export function InteractiveDemos() {
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState<"all" | "hosting" | "going">("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const toast = useToast();

  async function fakeDelete() {
    setDeleting(true);
    await new Promise((resolve) => setTimeout(resolve, 700));
    setDeleting(false);
    setConfirmOpen(false);
    toast.success("Event deleted", "Nothing was really deleted — this is a demo.");
  }

  return (
    <div className={styles.stack}>
      <div className={styles.block}>
        <p className={styles.subhead}>Segmented control</p>
        <div className={styles.row}>
          <SegmentedControl
            label="View mode"
            value={view}
            onChange={setView}
            options={[
              { value: "list", label: "List" },
              { value: "calendar", label: "Calendar" },
            ]}
          />
          <SegmentedControl
            label="Filter"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: "All", count: 12 },
              { value: "hosting", label: "Hosting", count: 5 },
              { value: "going", label: "Going", count: 3 },
            ]}
          />
        </div>
      </div>

      <div className={styles.block}>
        <p className={styles.subhead}>Toasts</p>
        <div className={styles.row}>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toast.success("You are going", "Friday Rooftop Social")}
          >
            Success
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toast.error("Could not register", "This event is full.")}
          >
            Error
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => toast.info("Request sent", "A host will review it.")}
          >
            Info
          </Button>
        </div>
      </div>

      <div className={styles.block}>
        <p className={styles.subhead}>Modal and confirmation</p>
        <div className={styles.row}>
          <Button variant="secondary" size="sm" onClick={() => setModalOpen(true)}>
            Open modal
          </Button>
          <Button
            variant="dangerGhost"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            Delete something
          </Button>
        </div>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Request a place"
        description="This event needs a host to approve you."
        footer={
          <>
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setModalOpen(false);
                toast.success("Request sent");
              }}
            >
              Send request
            </Button>
          </>
        }
      >
        <Field
          label="Message to the host"
          optional
          hint="A sentence on why you want to be there helps them decide."
        >
          <Input placeholder="I own the metric this flow affects…" />
        </Field>
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={fakeDelete}
        title="Delete this event?"
        message="Everyone registered will lose their place. This cannot be undone."
        confirmLabel="Delete event"
        destructive
        loading={deleting}
      />
    </div>
  );
}
