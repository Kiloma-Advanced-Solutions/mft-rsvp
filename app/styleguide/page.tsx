import type { ReactNode } from "react";

import { EventCard, EventGrid } from "@/components/events/EventCard";
import {
  AccessBadge,
  CapacityMeter,
  DateBlock,
  EventMetaDetails,
  EventStatusBadge,
  RegistrationBadge,
} from "@/components/events/EventMeta";
import {
  Avatar,
  AvatarStack,
  Badge,
  Button,
  Card,
  CardBody,
  CardFooter,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  FieldRow,
  Input,
  PageHeader,
  Person,
  Radio,
  Select,
  Spinner,
  Textarea,
} from "@/components/ui";
import { db } from "@/lib/db";
import type { BadgeTone, BadgeVariant } from "@/components/ui";
import type { EventAccess, RegistrationStatus } from "@/lib/types";

import { InteractiveDemos } from "./InteractiveDemos";
import styles from "./styleguide.module.css";

export const metadata = {
  title: "Style guide",
};

const SECTIONS = [
  ["colour", "Colour"],
  ["type", "Typography"],
  ["space", "Spacing"],
  ["buttons", "Buttons"],
  ["badges", "Badges"],
  ["forms", "Forms"],
  ["cards", "Cards"],
  ["people", "People"],
  ["states", "States"],
  ["event-chrome", "Event chrome"],
  ["event-cards", "Event cards"],
  ["interactive", "Interactive"],
] as const;

const SURFACE_TOKENS = [
  "--color-bg",
  "--color-bg-subtle",
  "--color-surface",
  "--color-surface-subtle",
  "--color-surface-hover",
  "--color-border",
  "--color-border-strong",
];

const TEXT_TOKENS = [
  "--color-text",
  "--color-text-muted",
  "--color-text-subtle",
];

const SEMANTIC_TOKENS = [
  "--color-primary",
  "--color-primary-soft",
  "--color-success",
  "--color-success-soft",
  "--color-warning",
  "--color-warning-soft",
  "--color-danger",
  "--color-danger-soft",
  "--color-info",
  "--color-info-soft",
];

const ACCENT_TOKENS = [
  "--accent-violet",
  "--accent-blue",
  "--accent-emerald",
  "--accent-amber",
  "--accent-rose",
  "--accent-cyan",
];

const TYPE_SCALE = [
  ["--text-3xl", "2.25rem"],
  ["--text-2xl", "1.75rem"],
  ["--text-xl", "1.375rem"],
  ["--text-lg", "1.125rem"],
  ["--text-md", "1rem"],
  ["--text-base", "0.9375rem"],
  ["--text-sm", "0.8125rem"],
  ["--text-xs", "0.75rem"],
] as const;

const SPACE_SCALE = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16];

const BADGE_TONES: BadgeTone[] = [
  "neutral",
  "primary",
  "success",
  "warning",
  "danger",
  "info",
];

const BADGE_VARIANTS: BadgeVariant[] = ["soft", "outline", "solid"];

const REGISTRATION_STATUSES: RegistrationStatus[] = [
  "going",
  "pending",
  "rejected",
  "cancelled",
  "waitlisted",
];

const ACCESS_MODES: EventAccess[] = ["open", "approval", "invite"];

export default async function StyleGuidePage() {
  const [users, events] = await Promise.all([db.users.list(), db.events.list()]);

  // A handful of real fixtures, so the cards below show genuine states rather
  // than lorem ipsum: something upcoming, something full, a draft, a past one.
  const sampleEvents = [
    events.find((event) => event.id === "e-design-critique"),
    events.find((event) => event.id === "e-oncall-training"),
    events.find((event) => event.id === "e-leadership-offsite"),
    events.find((event) => event.id === "e-hack-day"),
    events.find((event) => event.id === "e-postmortem"),
    events.find((event) => event.id === "e-sprint-retro"),
  ].filter((event) => event !== undefined);

  return (
    <div>
      <PageHeader
        eyebrow="Design system"
        title="Style guide"
        description="Every primitive in the kit, rendered. Build screens out of these rather than new one-off components, and the six of you will end up with apps that look like the same product."
      />

      <p className={styles.intro}>
        Tokens live in <code>app/styles/tokens.css</code>, primitives in{" "}
        <code>components/ui/</code>, and anything that knows what an event is in{" "}
        <code>components/events/</code>.
      </p>

      <nav className={styles.toc} aria-label="Style guide sections">
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className={styles.tocLink}>
            {label}
          </a>
        ))}
      </nav>

      {/* ---------------------------------------------------------- colour */}
      <Section id="colour" title="Colour" note="app/styles/tokens.css">
        <div className={styles.block}>
          <p className={styles.subhead}>Surfaces</p>
          <Swatches tokens={SURFACE_TOKENS} />
        </div>
        <div className={styles.block}>
          <p className={styles.subhead}>Text</p>
          <Swatches tokens={TEXT_TOKENS} />
        </div>
        <div className={styles.block}>
          <p className={styles.subhead}>Semantic</p>
          <Swatches tokens={SEMANTIC_TOKENS} />
        </div>
        <div className={styles.block}>
          <p className={styles.subhead}>Event accents</p>
          <Swatches tokens={ACCENT_TOKENS} />
        </div>
      </Section>

      {/* ------------------------------------------------------ typography */}
      <Section id="type" title="Typography" note="Geist Sans / Geist Mono">
        <div>
          {TYPE_SCALE.map(([token, size]) => (
            <div key={token} className={styles.typeRow}>
              <span className={styles.typeToken}>{token}</span>
              <span className={styles.typeSample} style={{ fontSize: size }}>
                Design Critique: Onboarding V3
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* --------------------------------------------------------- spacing */}
      <Section id="space" title="Spacing" note="4px scale">
        <div>
          {SPACE_SCALE.map((step) => (
            <div key={step} className={styles.spaceRow}>
              <span className={styles.typeToken}>--space-{step}</span>
              <span
                className={styles.spaceBar}
                style={{ width: `var(--space-${step})` }}
              />
              <span className={styles.sectionNote}>{step * 4}px</span>
            </div>
          ))}
        </div>
      </Section>

      {/* --------------------------------------------------------- buttons */}
      <Section id="buttons" title="Buttons" note="components/ui/Button.tsx">
        <div className={styles.block}>
          <p className={styles.subhead}>Variants</p>
          <div className={styles.row}>
            <Button>Register</Button>
            <Button variant="secondary">Edit event</Button>
            <Button variant="soft">Approve</Button>
            <Button variant="ghost">Cancel</Button>
            <Button variant="danger">Delete</Button>
            <Button variant="dangerGhost">Reject</Button>
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>Sizes</p>
          <div className={styles.row}>
            <Button size="sm">Small</Button>
            <Button size="md">Medium</Button>
            <Button size="lg">Large</Button>
            <Button size="sm" iconOnly aria-label="More">
              ⋯
            </Button>
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>States</p>
          <div className={styles.row}>
            <Button loading>Registering</Button>
            <Button disabled>Event is full</Button>
            <Button variant="secondary" disabled>
              Past event
            </Button>
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- badges */}
      <Section id="badges" title="Badges" note="components/ui/Badge.tsx">
        {BADGE_VARIANTS.map((variant) => (
          <div key={variant} className={styles.block}>
            <p className={styles.subhead}>{variant}</p>
            <div className={styles.row}>
              {BADGE_TONES.map((tone) => (
                <Badge key={tone} tone={tone} variant={variant}>
                  {tone}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </Section>

      {/* ----------------------------------------------------------- forms */}
      <Section id="forms" title="Forms" note="components/ui/Field.tsx">
        <div className={styles.formGrid}>
          <Field label="Title" required hint="Shown everywhere. Keep it short.">
            <Input defaultValue="Design Critique: Onboarding V3" />
          </Field>

          <Field label="Category">
            <Select defaultValue="design">
              <option value="design">Design</option>
              <option value="engineering">Engineering</option>
              <option value="product">Product</option>
            </Select>
          </Field>

          <Field label="Capacity" optional hint="Leave empty for no limit.">
            <Input type="number" placeholder="12" />
          </Field>

          <Field label="Starts at" required>
            <Input type="datetime-local" defaultValue="2026-09-24T14:00" />
          </Field>
        </div>

        <div className={styles.block}>
          <Field
            label="Description"
            error="Give people something to read before they commit."
          >
            <Textarea aria-invalid placeholder="What happens, and who it is for…" />
          </Field>
        </div>

        <FieldRow className={styles.block}>
          <div>
            <p className={styles.subhead}>Radio group</p>
            {ACCESS_MODES.map((mode) => (
              <Radio
                key={mode}
                name="sg-access"
                defaultChecked={mode === "approval"}
                label={mode}
                hint={`access: "${mode}"`}
              />
            ))}
          </div>
          <div>
            <p className={styles.subhead}>Checkboxes</p>
            <Checkbox
              defaultChecked
              label="Notify the hosts"
              hint="Sends an email when someone requests a place."
            />
            <Checkbox label="Publish immediately" />
            <Checkbox disabled label="Add to company calendar" hint="Not wired up." />
          </div>
        </FieldRow>
      </Section>

      {/* ----------------------------------------------------------- cards */}
      <Section id="cards" title="Cards" note="components/ui/Card.tsx">
        <div className={styles.grid}>
          <Card>
            <p className={styles.subhead}>Default</p>
            <p>Padded surface with a hairline border and a small shadow.</p>
          </Card>

          <Card subtle elevation="flat">
            <p className={styles.subhead}>Subtle, flat</p>
            <p>For cards that sit on top of another surface.</p>
          </Card>

          <Card padding="none">
            <CardHeader
              title="Approval queue"
              description="2 people waiting"
              actions={<Badge tone="warning">2</Badge>}
            />
            <CardBody>
              <p>Header, body and footer sections for structured panels.</p>
            </CardBody>
            <CardFooter>
              <Button variant="ghost" size="sm">
                Reject all
              </Button>
              <Button size="sm">Approve all</Button>
            </CardFooter>
          </Card>
        </div>
      </Section>

      {/* ---------------------------------------------------------- people */}
      <Section id="people" title="People" note="components/ui/Avatar.tsx">
        <div className={styles.block}>
          <p className={styles.subhead}>Avatar sizes</p>
          <div className={styles.row}>
            <Avatar user={users[0]} size="xs" />
            <Avatar user={users[1]} size="sm" />
            <Avatar user={users[2]} size="md" />
            <Avatar user={users[3]} size="lg" />
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>Stack, with overflow</p>
          <div className={styles.row}>
            <AvatarStack users={users.slice(0, 3)} size="sm" />
            <AvatarStack users={[...users, ...users]} max={4} size="sm" />
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>Named</p>
          <div className={styles.row}>
            <Person user={users[0]} />
            <Person user={users[2]} meta="Requested 2 days ago" />
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------------- states */}
      <Section id="states" title="States" note="Empty, loading">
        <div className={styles.block}>
          <EmptyState
            icon="◳"
            title="Nothing on the board yet"
            description="Events you can register for will show up here as soon as a host publishes one."
            actions={<Button size="sm">Create an event</Button>}
          />
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>Spinner</p>
          <div className={styles.row}>
            <Spinner size="sm" />
            <Spinner size="md" />
            <Spinner size="lg" />
          </div>
        </div>
      </Section>

      {/* ---------------------------------------------------- event chrome */}
      <Section
        id="event-chrome"
        title="Event chrome"
        note="components/events/EventMeta.tsx"
      >
        <div className={styles.block}>
          <p className={styles.subhead}>Date blocks</p>
          <div className={styles.row}>
            {sampleEvents.slice(0, 4).map((event) => (
              <DateBlock
                key={event.id}
                iso={event.startsAt}
                accent={event.accent}
              />
            ))}
            <DateBlock iso={sampleEvents[0].startsAt} size="lg" accent="violet" />
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>Access</p>
          <div className={styles.row}>
            {ACCESS_MODES.map((access) => (
              <AccessBadge key={access} access={access} />
            ))}
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>Lifecycle</p>
          <div className={styles.row}>
            <EventStatusBadge event={{ status: "draft", startsAt: futureIso() }} />
            <EventStatusBadge
              event={{ status: "cancelled", startsAt: futureIso() }}
            />
            <EventStatusBadge event={{ status: "published", startsAt: pastIso() }} />
            <span className={styles.sectionNote}>
              (published + upcoming renders nothing)
            </span>
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>Where the viewer stands</p>
          <div className={styles.row}>
            {REGISTRATION_STATUSES.map((status) => (
              <RegistrationBadge key={status} status={status} />
            ))}
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>Capacity</p>
          <div className={styles.grid}>
            <CapacityMeter going={7} capacity={20} />
            <CapacityMeter going={3} capacity={3} />
            <CapacityMeter going={41} capacity={null} />
          </div>
        </div>

        <div className={styles.block}>
          <p className={styles.subhead}>When and where</p>
          <div className={styles.demoSurface}>
            <EventMetaDetails event={sampleEvents[0]} />
          </div>
        </div>
      </Section>

      {/* ----------------------------------------------------- event cards */}
      <Section
        id="event-cards"
        title="Event cards"
        note="components/events/EventCard.tsx"
      >
        <p className={styles.intro}>
          Real fixtures, so you can see how the card handles a full event, a
          draft, a cancellation and something in the past. The whole card is one
          link — do not put buttons inside it.
        </p>

        <EventGrid className={styles.block}>
          {sampleEvents.map((event, index) => (
            <EventCard
              key={event.id}
              event={event}
              attendees={users.slice(0, (index % 4) + 1)}
              goingCount={event.capacity === 3 ? 3 : (index % 4) + 1}
              viewerStatus={index === 0 ? "pending" : index === 1 ? "going" : null}
              hostName={
                users.find((user) => user.id === event.organizerId)?.name
              }
            />
          ))}
        </EventGrid>
      </Section>

      {/* ------------------------------------------------------ interactive */}
      <Section
        id="interactive"
        title="Interactive"
        note="Modal, toasts, segmented control"
      >
        <InteractiveDemos />
      </Section>
    </div>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {note && <span className={styles.sectionNote}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Swatches({ tokens }: { tokens: string[] }) {
  return (
    <div className={styles.swatches}>
      {tokens.map((token) => (
        <div key={token} className={styles.swatch}>
          <div
            className={styles.swatchChip}
            style={{ ["--chip" as string]: `var(${token})` }}
          />
          <p className={styles.swatchLabel}>{token}</p>
        </div>
      ))}
    </div>
  );
}

function futureIso() {
  return new Date(Date.now() + 3 * 86_400_000).toISOString();
}

function pastIso() {
  return new Date(Date.now() - 3 * 86_400_000).toISOString();
}
