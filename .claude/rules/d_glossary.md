---
description: The product's vocabulary — access modes, statuses, roles, hosts, capacity, personas.
---

# Glossary

The authoritative definitions are `lib/types.ts` (shapes) and `TASKS.md` §4
(behaviour: the visibility table, the permission table, the registration rules).
Those two are not copied here — read them for the tables. This file is the
vocabulary, so the words mean the same thing on every screen.

User-facing wording for all of these comes from `lib/labels.ts`. Import it
rather than typing strings into JSX.

## Access mode — how people get into an event

`EventAccess`, and the heart of the product.

- **open** — anyone can see it; registering confirms immediately.
- **approval** — anyone can see it; registering creates a request a host decides on.
- **invite** — only hosts and invited people can see it *at all*; invited people
  register in one step.

## Event status — the event's own lifecycle, separate from access

`EventStatus`: **draft** (hosts and admins only, nobody can register),
**published** (live; visibility follows access mode), **cancelled** (still
visible to whoever could see it, registration closed).

## Roles and hosts

`UserRole`: **member** browses and registers · **organizer** also creates events
and manages the ones they host · **admin** manages every event.

A **host** is the event's `organizerId` or anyone in its `coHostIds`. Role and
host are different axes: an organizer looking at someone else's event is not a
host of it. A host is not automatically an attendee — they register like anyone
else.

## Registration status

`RegistrationStatus`: **going** (confirmed) · **pending** (awaiting a host
decision, only on approval events) · **rejected** (a host declined; they may not
re-request, though a host can still approve them from the queue) · **cancelled**
(they withdrew; they may register again) · **waitlisted** (exists in the type,
nothing produces it yet — a stretch goal).

A person has at most one registration per event.

## Capacity and full

**Full** means the number of `going` registrations has reached `capacity`. Only
`going` counts — `pending`, `cancelled`, `rejected` and `waitlisted` do not.
`capacity: null` means unlimited.

## Leak

Shorthand for the project's cardinal sin: an event reaching someone who is not
permitted to see it. Filtering in the browser is not enough — an invite-only
event must be absent from the server response itself. An event someone may not
see returns **404, never 403**; a 403 confirms it exists.

## The five personas

There is no login. You "sign in" by picking a persona, which sets the
`eb_persona` cookie. Switching persona is how visibility rules get verified.

| Persona | Role | Tests |
| --- | --- | --- |
| Maya Cohen | organizer | Hosting, editing, the approval queue |
| Daniel Ross | organizer | An organizer looking at *someone else's* event |
| Priya Nair | member | The plain attendee experience |
| Tom Alvarez | member | Someone with a rejected request |
| Sara Klein | admin | Managing an event they do not host |
