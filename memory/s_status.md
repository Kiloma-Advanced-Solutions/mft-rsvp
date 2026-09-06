# Current State

Where the project is right now. This file is **rewritten in place** as work
progresses — it is current state, not a changelog.

## Active milestone

**None in progress.** M1–M5 are complete and merged: all three `must`
milestones and both `should` milestones are done.

What remains is the stretch list, which nothing has started. `TASKS.md` §5
gives it in the order it would be picked up — the calendar view first, then the
waitlist, managing invitations, search, "my events", optimistic UI and a theme
toggle. Authoritative requirements for every milestone and stretch goal:
[TASKS.md](../TASKS.md) §5.

## Status

Both screens are server-rendered end to end, and the controls on them act — for
attendees since M3, and for hosts since M4 and M5.

`/events` resolves the viewer, loads only the events that viewer may see, and
then filters, sorts and groups them; the category and access filters live in the
URL. Whoever may create an event gets a **New event** action here.

`/events/[id]` shows one event to whoever may see it. An event that does not
exist and an event the viewer may not see produce the same 404, so the page
cannot confirm that a hidden event exists.

Attendees act: registering, requesting a place and withdrawing all go through
the registrations route, which enforces the [TASKS.md](../TASKS.md) §4 rules on
the server.

Hosts act too. A host can **create** an event, **edit** it in place, **publish**
a draft and **delete** it (M4) — and now **decide the requests on it** (M5).

The approval queue is a host-only section of `/events/[id]` listing the requests
still waiting and the ones already turned down, with whatever message the
requester sent. A host approves or rejects each one, and the counts, the
capacity meter and "Who is going" re-derive on the spot. How it fits together is
in [a_system.md](a_system.md); why it behaves as it does is in
[dec_log.md](dec_log.md).

Nothing is inert any more: every control the product renders now acts.

## What is actually implemented

Everything that is not the product was supplied. Do not rebuild it — see
[TASKS.md](../TASKS.md) §3 for the full inventory.

- Design tokens (light and dark) and the `components/ui/` kit.
- `components/events/` — cards, badges, date blocks, capacity meter.
- `components/layout/` — app shell, nav, persona switcher.
- The in-memory store, seeded with 12 events and 5 people covering every state.
- `/api/session` (the API house-style example) and `/api/dev/reset`.
- `/styleguide` and the start page at `/`.

The product built on top of that: the board and the detail screen, the shared
permission and event-context layers beneath them, the registration write path,
the four host write paths added by M4, and the two request-decision routes added
by M5. The shape of all of it is in [a_system.md](a_system.md).

## Deliberately absent

Not missing — decided against, for this milestone or for the exercise. A later
session should not treat any of these as an oversight to fix.

From M5's scope:

- **No attendee removal.** Approving is the only host decision that clears a
  request from the queue; there is no host action that takes a confirmed place
  back. That would be attendee management, not a third decision on a request.
- **No request-message input.** The queue *displays* a message when a
  registration carries one, but nothing in the product writes one — only the
  fixtures do. Collecting them means reopening the registration write path.
- **No bulk approve or reject.** [TASKS.md](../TASKS.md) §5 asks for a decision
  on each request.
- **No optimistic UI** on any control, in M5 or anywhere else.

From earlier milestones, and still true: cancelling an event, co-host
management, and transferring an event to another organizer.

Every stretch goal is unstarted, including the two that sit closest to M5 — the
**waitlist** with its auto-promotion, and **managing invitations**. Note that
approving somebody who can no longer see an invite-only event does *not* add
them to its invite list; that is invitation management, and it is out of scope.

## Known limitations

Two simultaneous registrations for the final seat can race, because the supplied
in-memory store offers no atomic capacity reservation. M3 accepted this rather
than redesigning the data layer; M4 did not change it; and M5 met the same
question from the host's side, when it enforced that a host cannot approve past
capacity, and **deliberately left it unsolved**. It is not a newly discovered
bug. The reasoning is in [dec_log.md](dec_log.md).

Concurrent edits to the same event are last-write-wins: `EventRecord` carries no
version, so M4 did not attempt optimistic concurrency. Named, not solved.

A request left pending on an event that has been cancelled or has already
started can no longer be decided by anyone, which is the accepted cost of
closing decisions the same way registration closes. No cleanup behaviour exists.

## Blockers

None.

## Branches and worktrees

- Integration branch: **`yardenah/events-board`**. Milestone branches are created
  from it, and merged back through their own PR.
- The workflow and its conventions are in [u_environment.md](u_environment.md).

## Before saying you are done

Verification requirements and their sources are in
[c_conventions.md](c_conventions.md); the definition of done is
[TASKS.md](../TASKS.md) §7.

---

Last updated: 2026-09-06 — M5 complete and merged; no milestone in progress.
