# Domain Glossary

Conceptual meaning of the Events Board vocabulary. Domain meaning is not the same
thing as TypeScript structure, which is why this file exists.

- Exact type definitions → [lib/types.ts](../lib/types.ts)
- Behavioural rules and permission tables → [TASKS.md](../TASKS.md) §4
- The words shown to users → [lib/labels.ts](../lib/labels.ts)

This file explains terminology. It is not a second specification, so no rule
tables are reproduced here.

The code values below — `open`, `pending`, `draft` and the rest — stay English.
They are stored values and union members, not copy. The other terms are this
project's own English vocabulary for discussing the domain, and they are equally
fine to keep using in code, comments and documentation. Either way, the Hebrew a
user sees is presentation: a display label, mapped in
[lib/labels.ts](../lib/labels.ts), with the boundary between the two described
in [a_system.md](a_system.md).

## People

- **member** — the baseline role. Browses the events they may see, and registers.
- **organizer** — a member who may also create events and manage the ones they
  host.
- **admin** — may manage every event in the system, hosted or not.
- **host** — *not a role*. A host is the event's `organizerId`, or anyone in its
  `coHostIds`. This is the term that decides who may edit, publish, cancel,
  delete, decide requests on, remove or restore attendees of, and manage the
  invitations to a specific event. A host is not automatically an attendee.
- **invite list** / **invited user** — the people, beyond its hosts and admins,
  who may see an invite-only event; an invited user is someone on it (an event's
  `invitedUserIds`). Being invited is **not a registration and not a seat**: it
  makes the event visible and lets the person register through the ordinary
  flow, and nothing more. Somebody who may manage the event cannot be invited
  — they see it without an invitation. Only meaningful while the access mode is `invite`;
  on any other access the list is **dormant** — kept exactly as it was,
  read-only, and counting again if the event goes back to `invite`.
- **revoking an invitation** — taking a person off the invite list. It takes
  away their sight of the event and nothing else: whatever registration they
  hold keeps its status, and a `going` place keeps its seat. Not the same as
  removing an attendee, which takes back the place and leaves the invitation.
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
  - `cancelled` — called off, but not deleted. Reached only from `published`,
    and terminal: an event never leaves it. Still visible to whoever could see
    it; registering, withdrawing and deciding requests are closed; its
    registrations are kept as they were.

→ [lib/types.ts](../lib/types.ts) for `EventRecord`, `EventAccess`, `EventStatus`,
`EventCategory`, `EventLocation`.

## Registration

- **registration** — one person's standing with respect to one event. A person has
  at most one per event, and it carries an optional message plus who decided it.
- `going` — confirmed. The only status that counts against capacity.
- `pending` — awaiting a host's decision. Only occurs on `approval` events.
- `rejected` — a host declined the request. Not final from the host's side: the
  person may not ask again, but a host may still approve them later.
- **approval queue** — the host-only list on an event's detail page of the
  requests still awaiting a decision, together with the ones already turned
  down. Approving is the only host decision that removes a row: the person
  becomes `going` and appears among the attendees instead. A row also leaves
  when its requester withdraws, since that makes the registration `cancelled`.
- **cancelled registration** — the person withdrew. Note the collision: a
  *cancelled event* (`EventStatus`) and a *cancelled registration*
  (`RegistrationStatus`) are unrelated things that share a word. Not the same
  as `removed`, which is a host's act rather than the person's own answer.
- `removed` — a host or admin took back a confirmed place. Not the person's own
  answer (`cancelled`) and not a decision on a request (`rejected`). While the
  event's access is `approval` or `invite` the person may not register again on
  their own; a host may restore them, subject to the event's lifecycle and
  capacity. Once the event is `open`, ordinary registration is their way back
  instead, and a host has nothing to restore. Removal does not revoke an
  invitation.
- `waitlisted` — exists in the type, but nothing in the app produces it. It is
  there for a stretch goal.

Registration statuses have their own user-facing wording, and it is Hebrew:
`pending` displays as "ממתין לאישור", `cancelled` as "לא מגיע/ה", `removed` as
"הוסר/ה". The *values* are unchanged — what this glossary defines is the
identifier, not the label.
Import the copy from [lib/labels.ts](../lib/labels.ts) rather than inventing it.

→ [lib/types.ts](../lib/types.ts) for `Registration` and `RegistrationStatus`;
[TASKS.md](../TASKS.md) §4 for what registering, withdrawing and re-registering do.

## Capacity

- **capacity** — the maximum number of confirmed attendees. `null` means
  unlimited.
- **full** — the number of `going` registrations has reached capacity. Only
  `going` counts; `pending`, `cancelled`, `rejected`, `waitlisted` and
  `removed` do not.

→ [TASKS.md](../TASKS.md) §4 for when registration is closed and how capacity
interacts with each access mode.

## Access concepts

- **visibility** — "may this person see this event at all?" When the answer is no
  the event must be absent from pages *and* from API responses, and a direct URL
  must 404. A 403 would confirm the event exists.
- **manageability** — "may this person edit, delete, publish, cancel, decide
  requests on, remove and restore attendees of, or manage the invitations to
  this event?" A separate
  question with a separate answer: visibility is about discovery,
  manageability is about being a host or an admin. Keeping them distinct is
  what stops "can see" from creeping into "can change".
- **registration availability** — "may this person take a place at this event
  right now, and if not, why not?" The third question, and again a separate one:
  seeing an event, and even being able to manage it, does not mean being able to
  register for it. What closes registration, and what registering produces, are
  in [TASKS.md](../TASKS.md) §4.
- **request decision availability** — "what may a host decide about *this*
  request right now?" The fourth question. It is about a row somebody else owns,
  which is what separates it from registration availability, and it is answered
  without reference to who is asking — whether the actor may decide at all is
  manageability. Approving and rejecting close for different reasons, so the
  answer names them separately: a full event still takes a rejection, and a
  request already turned down may still be approved but not turned down twice.
- **cancellation availability** — "may this event be cancelled right now?" The
  fifth question, and about the event's own lifecycle rather than anybody's
  place in it. Like request decision availability it is answered without
  reference to who is asking — whether the actor may cancel at all is
  manageability. Only a published event that has not started yet may be.
- **attendee removal availability** — "may a host take this confirmed place
  back right now?" The sixth question. Like request decision availability it is
  about a row somebody else owns and ignores who is asking — whether the actor
  may remove anyone is manageability. It does depend on the *target*: a place
  belonging to someone who may manage the event is not removable this way.
  Closed on an `open` event, where a host has no say over who attends.
- **attendee restore availability** — "may a host give this removed attendee
  their place back right now?" The seventh question, also answered without
  reference to the actor. Restoring takes a seat, so capacity closes it, and it
  is closed on an `open` event, where the person may register again on their
  own.
- **invitation availability** — "may anybody be added to this event's invite
  list right now, and may this person be?" The eighth question, asked at two
  levels: the list's, about the event alone — only while access is `invite`,
  including on a draft, and not once the event is cancelled or has started —
  and then the person's, which depends on the *target*, since someone who may
  manage the event or is already invited is not a valid invitee. Never about a
  place: capacity plays no part, and the person's registration is not read.
- **invitation revocation availability** — "may this person's invitation be
  revoked right now?" The ninth question. Only while access is `invite` and the
  person is on the list; deliberately *not* closed by a cancellation or a start
  time that has passed, because revoking only narrows who can see the event.
- **`EventWithContext`** — the derived view-model an event screen usually needs:
  the event plus its hosts, the going and pending counts, the viewer's own
  registration, and whether the viewer may manage it. Built by
  [lib/events.ts](../lib/events.ts), after visibility has been applied. The
  detail screen's version adds the confirmed attendees themselves, the
  approval queue's rows, the **managed attendees** — the `going` and
  `removed` rows with what a host may do about each — and the host's view of
  the **invite list**, with the **candidates** who may be added. The queue and
  the managed attendees are left empty for anyone who may not manage the event;
  the invite list is left `null` for them, an invitee included.

→ [TASKS.md](../TASKS.md) §4 for the authoritative visibility and action tables.
