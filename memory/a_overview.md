# a_overview — what this project is

**Events Board** (`mft-rsvp`) — an internal events board. Organizers publish
events; everyone else finds them and registers. It is the codebase for the
Kiloma *Claude Code for Teams* workshop: the platform is finished, the product
is not.

## The product in one table

An event opens up in one of three ways. This is the heart of the domain.

| Access | Who can see it | What registering does |
| --- | --- | --- |
| `open` | everyone | confirms immediately → `going` |
| `approval` | everyone | creates a request → `pending`, a host decides |
| `invite` | hosts and invited people **only** | confirms immediately → `going` |

Two constraints shape every design call:

1. **No separate edit screen.** Hosts edit an event on the event's own detail
   page, where extra controls appear for them. One screen, three audiences.
2. **The board must never leak.** An invite-only event is absent from the board
   *and from the API response* for anyone not invited. Filtering it in the
   browser does not count. An event you cannot see is a **404, never a 403** — a
   403 confirms it exists.

## Milestones

Musts first. See [`s_status.md`](s_status.md) for live state and
[`s_backlog.md`](s_backlog.md) for pick-up order.

| ID | Milestone | Weight |
| --- | --- | --- |
| M1 | The board — `/events`, filtered to what the viewer may see | **must** |
| M2 | The event detail screen — `/events/[id]`, 404 when not visible | **must** |
| M3 | Register and respond — API routes enforcing every rule server-side | **must** |
| M4 | Create and edit in place — no second screen | should |
| M5 | The approval queue — hosts approve/reject on the detail page | should |

Stretch, in the order we would pick them up: calendar view → waitlist →
managing invitations → search → "my events" → optimistic UI → theme toggle.

## What is already built (do not rebuild)

Design tokens, the UI kit, the events component set, the app shell, the async
in-memory store, seeded fixtures, persona switching, and the API house style.
`/styleguide` renders every component with real data — **read it before writing
any CSS**. Details: [`a_system.md`](a_system.md).

## How it is judged

In roughly this order, from the brief:

1. **Correctness of the rules.** Does the board leak? Is the API safe on its own?
2. **Where the logic lives.** One place that answers "can this person see this
   event", or the same question re-answered in six files?
3. **Reuse.** Built on the kit, or reinvented buttons and cards?
4. **The detail screen.** How well one screen serves an attendee and a host.
5. **How Claude Code was driven.** Commits and the PR show this clearly.
6. **Honesty.** Whether the PR matches what the code actually does.

The full brief is [`TASKS.md`](../TASKS.md) at the repo root — it is the
specification, and it wins over anything remembered here. See
[`r_references.md`](r_references.md).
