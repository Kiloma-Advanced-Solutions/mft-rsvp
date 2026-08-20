---
description: What already exists in components/, where new components go, and prop conventions.
paths:
  - "components/**"
---

# The UI kit

Check `/styleguide` before building anything — it renders the whole kit with real
data, and the component you need probably exists. Rebuilding a button or a card
is the most visible failure mode in this project.

## Where a component goes

- `components/ui/` — generic primitives that know nothing about events.
- `components/events/` — anything that understands the domain.
- `components/layout/` — the app frame.

New components you genuinely needed live next to the ones already there, and
look like them.

## What exists

**`components/ui/`** — imported from the barrel `@/components/ui`:
`Avatar`, `AvatarStack`, `Person` · `Badge` (+ `BadgeTone`, `BadgeVariant`) ·
`Button`, `buttonClass` (+ `ButtonVariant`, `ButtonSize`) · `Card`, `CardHeader`,
`CardBody`, `CardFooter` · `EmptyState` · `Field`, `FieldRow`, `Input`,
`Textarea`, `Select`, `Checkbox`, `Radio` · `Modal`, `ConfirmDialog` ·
`PageHeader` · `SegmentedControl` (+ `SegmentOption`) · `Spinner`,
`LoadingBlock` · `ToastProvider`, `useToast`.

`buttonClass()` exists so a `next/link` can be styled as a button without
nesting a `<button>` inside an `<a>`.

**`components/events/`** — `EventCard` and `EventGrid` (both from
`EventCard.tsx`); `DateBlock`, `AccessBadge`, `EventStatusBadge`,
`RegistrationBadge`, `EventMetaLine`, `EventMetaDetails`, `CapacityMeter` (from
`EventMeta.tsx`).

`EventCard` is the board's unit of currency. The whole card is **one link** to
the event — no buttons inside it, because nesting interactive elements inside an
anchor is invalid and a card with three click targets is a card nobody knows how
to click. Everything it renders is passed in: working out `goingCount`, the
attendees and the viewer's own status is the caller's job.

**`components/layout/`** — `AppShell` (server; sticky top bar, centred column,
reads the session), `NavLink` (client; pathname highlight), `PersonaSwitcher`
(client; the stand-in for authentication).

## Props

Props are explicit. No prop spreading through several layers. Types are written
inline in the signature — that is the house style:

```tsx
export function EventCard({ event, viewerStatus }: {
  event: EventRecord;
  viewerStatus?: RegistrationStatus | null;
}) {
```

Conditional class names use `cx()` from `lib/cx.ts`:
`cx(styles.card, dimmed && styles.dimmed, className)`.

Components take a `className` prop when a parent may need to place them; they
never reach into another component's module styles.
