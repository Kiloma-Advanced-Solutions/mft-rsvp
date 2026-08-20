# s_backlog — what to pick up next

> **Volatile.** Rewrite at wrap time from actual state. Paired with
> [`s_status.md`](s_status.md); the freshness stamp lives there.

Ordered. The musts are solid before anything below them is touched — that is the
brief's instruction, not a preference.

---

## Next

**1. M1 — the board** · `/events` · *must*

The whole product's correctness starts here, because it is where the leak would
show. Replace the stub in `app/events/page.tsx`.

- Use `EventCard` in an `EventGrid`. **Do not write a new card.**
- Upcoming first, soonest first; past events separate and de-emphasised.
- Each card shows the viewer's own registration status when they have one.
- Filter by category and by access mode.
- A real empty state, not a blank page.

*Done when:* switching from Maya to Priya removes both invite-only events from
the board **and the count changes**.

*Do first:* decide where "can this person see this event" lives, and put it
somewhere both the page and the future route handler can call. Every later
milestone depends on that choice — see [`a_system.md`](a_system.md) § 3.

---

**2. M2 — the event detail screen** · `/events/[id]` · *must*

One screen, three audiences. Replace the stub.

- Everything about the event: when, where, description, hosts, capacity, who is
  going.
- **404** for anyone not allowed to see it — never 403.
- A call to action reflecting the viewer's actual state: register, request a
  place, withdraw, "awaiting approval", "this event is full", "this event has
  passed".
- Host-only controls appear here, and only for hosts.

*Done when:* opening an invite-only event's URL directly as Tom gives a 404.

---

**3. M3 — register and respond** · *must*

- `POST` / `DELETE` (or `PATCH`) under `/api/events/[id]/registrations`,
  following `app/api/session/route.ts`.
- **Every rule in section 4 of `TASKS.md` enforced on the server. Assume the
  client lies.**
- The UI updates without a full page reload and shows errors from the server.

*Done when:* curling the register endpoint as a member, for an invite-only event
you were not invited to, fails with a sensible status.

---

## After the musts

**4. M4 — create and edit in place** · *should*
Hosts edit on the detail page; no second screen. Where *creating* lives is a
design call — `/events/new`, a modal, or create-a-draft-and-land-on-it. Justify
it in the PR. Deleting asks first; `ConfirmDialog` already exists.

**5. M5 — the approval queue** · *should*
Pending requests on the detail page with the requester's message; approve and
reject; counts and attendee list update immediately. A host **cannot approve
past capacity**.

## Stretch, in the order we would pick them up

1. **Calendar view** — month grid on `/events`, toggled with `SegmentedControl`.
   `toDayKey()` in `lib/date.ts` exists for the grouping.
2. **Waitlist** — `waitlisted` already exists in `RegistrationStatus`.
   Auto-promote when someone withdraws.
3. **Managing invitations** — hosts add and remove invited people.
4. **Search** across title, summary and description.
5. **"My events"** — hosting, going, awaiting approval.
6. **Optimistic UI** on the register button.
7. **Theme toggle** — tokens already support `data-theme` on `<html>`.

---

## Memory-bank backlog

- [ ] Every teammate runs `./scripts/memory-bank.sh link` once per machine.
- [ ] Add `u_<name>.md` per teammate; do not edit someone else's.
- [ ] First real memory wrap PR after M1 merges — proves the cadence works
      end to end and re-stamps the freshness line in `s_status.md`.
- [ ] Part 3a of the training adds `c_bugbot_workflow.md` (TDD-per-finding,
      pre-push self-audit). Not written yet — do not link to it until it exists.

---

## Edge cases the reviewers look for

Not a checklist to grind. Three handled well beat all of them handled badly.

- The API returns invite-only events to people not invited.
- Authorisation checked in the component but not in the route handler.
- The client sends its own `userId` and the server believes it.
- Capacity counting `pending` or `cancelled` rows.
- Registration open on a past, draft, or cancelled event.
- Switching an event from `invite` to `open` — what happens to the invite list,
  and to people already going?
- Deleting an event that has registrations.
- A host approving a request that would push past capacity.
- A member's state after they withdraw and register again.
- Dates formatted differently on server and client (hydration warnings).
