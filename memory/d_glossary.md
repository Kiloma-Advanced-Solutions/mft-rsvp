# Domain Glossary

Conceptual meaning of the Events Board vocabulary. Domain meaning is not the same
thing as TypeScript structure, which is why this file exists.

- Exact type definitions → [lib/types.ts](../lib/types.ts)
- Behavioural rules and permission tables → [TASKS.md](../TASKS.md) §4
- The words shown to users → [lib/labels.ts](../lib/labels.ts)

This file explains terminology. It is not a second specification, so no rule
tables are reproduced here.

## People

- **member** — the baseline role. Browses the events they may see, and registers.
- **organizer** — a member who may also create events and manage the ones they
  host.
- **admin** — may manage every event in the system, hosted or not.
- **host** — *not a role*. A host is the event's `organizerId`, or anyone in its
  `coHostIds`. This is the term that decides who may edit, publish, delete and
  decide requests on a specific event. A host is not automatically an attendee.
- **invited user** — someone in an event's `invitedUserIds`. Only meaningful when
  the access mode is `invite`.
- **persona** — the stand-in for authentication. You "sign in" by picking one from
  the switcher, which sets a cookie; switching persona is how visibility rules get
  verified.

→ [lib/types.ts](../lib/types.ts) for `UserRole` and `User`; [TASKS.md](../TASKS.md) §3
for the five seeded personas and what each is useful for.

## Events

- **event** — a thing people register for: when, where, description, hosts,
  capacity, an access mode and a lifecycle status.
- **access mode** — how people get into an event. The heart of the product; it
  decides both visibility and what registering does.
  - `open` — anyone may see it; registering confirms immediately.
  - `approval` — anyone may see it; registering creates a request a host decides
    on.
  - `invite` — only hosts, admins, and invited people may see it at all; invited
    people are confirmed in one step when registration is allowed.
- **event status** — the lifecycle of the event itself, independent of who may
  attend.
  - `draft` — hosts only; nobody can register.
  - `published` — live; visibility follows the access mode.
  - `cancelled` — still visible to whoever could see it; registration closed.

→ [lib/types.ts](../lib/types.ts) for `EventRecord`, `EventAccess`, `EventStatus`,
`EventCategory`, `EventLocation`.

## Registration

- **registration** — one person's standing with respect to one event. A person has
  at most one per event, and it carries an optional message plus who decided it.
- `going` — confirmed. The only status that counts against capacity.
- `pending` — awaiting a host's decision. Only occurs on `approval` events.
- `rejected` — a host declined the request.
- **cancelled registration** — the person withdrew. Note the collision: a
  *cancelled event* (`EventStatus`) and a *cancelled registration*
  (`RegistrationStatus`) are unrelated things that share a word.
- `waitlisted` — exists in the type, but nothing in the app produces it. It is
  there for a stretch goal.

Registration statuses have their own user-facing wording — `pending` displays as
"Awaiting approval", `cancelled` as "Not going". Import that copy from
[lib/labels.ts](../lib/labels.ts) rather than inventing it.

→ [lib/types.ts](../lib/types.ts) for `Registration` and `RegistrationStatus`;
[TASKS.md](../TASKS.md) §4 for what registering, withdrawing and re-registering do.

## Capacity

- **capacity** — the maximum number of confirmed attendees. `null` means
  unlimited.
- **full** — the number of `going` registrations has reached capacity. Only
  `going` counts; `pending`, `cancelled`, `rejected` and `waitlisted` do not.

→ [TASKS.md](../TASKS.md) §4 for when registration is closed and how capacity
interacts with each access mode.

## Access concepts

- **visibility** — "may this person see this event at all?" When the answer is no
  the event must be absent from pages *and* from API responses, and a direct URL
  must 404. A 403 would confirm the event exists.
- **manageability** — "may this person edit, delete, publish, or decide requests
  on this event?" A separate question with a separate answer: visibility is about
  discovery, manageability is about being a host or an admin. Keeping them
  distinct is what stops "can see" from creeping into "can change".
- **registration availability** — "may this person take a place at this event
  right now, and if not, why not?" The third question, and again a separate one:
  seeing an event, and even being able to manage it, does not mean being able to
  register for it. What closes registration, and what registering produces, are
  in [TASKS.md](../TASKS.md) §4.
- **`EventWithContext`** — the derived view-model an event screen usually needs:
  the event plus its hosts, the going and pending counts, the viewer's own
  registration, and whether the viewer may manage it. Built by
  [lib/events.ts](../lib/events.ts), after visibility has been applied.

→ [TASKS.md](../TASKS.md) §4 for the authoritative visibility and action tables.
