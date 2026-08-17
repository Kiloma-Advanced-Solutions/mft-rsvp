# Events Board — the brief

You have **80 minutes** and Claude Code. Build the events board.

Everything that is not the product has been done for you: the design system, the
UI kit, the data layer, the session, and the API conventions. Do not rebuild any
of it. Spend the time on the product.

---

## 1. What you are building

An internal events board. Two halves:

**Management.** People who are allowed to run events can create them, edit them
and delete them. An event opens up in one of three ways:

| Mode | Who can see it | What registering does |
| --- | --- | --- |
| **Open** | Everyone | Confirms them immediately |
| **Approval needed** | Everyone | Creates a request a host decides on |
| **Invite only** | Hosts and invited people only | Confirms them immediately |

**Discovery.** Everyone else browses the board — a list or a calendar of the
events they are allowed to see — and registers for the ones they want.

### Two constraints that shape the design

1. **There is no separate edit screen.** Hosts edit an event on the event's own
   detail page, where extra controls appear for them. Everyone gets the same
   screen; hosts get more of it. This is deliberate — a second, near-identical
   edit screen is exactly the kind of duplication we do not want.
2. **The board must never leak.** An invite-only event does not appear on the
   board for someone who was not invited, and it does not appear in the API
   response either. Filtering it out in the browser does not count.

---

## 2. Ground rules

- Work on your own branch: `git checkout -b <yourname>/events-board`.
- Commit as you go. We will read your history.
- Open a PR when you are done — or when the 80 minutes are up, whichever comes
  first. An honest PR that says "M4 not started" beats a broken one that claims
  everything works.
- You will not finish all of this. That is the point. Get the **musts** solid
  before you touch anything else.

---

## 3. What is already here

Run `npm run dev` and open <http://localhost:3000> — the start page lists it all,
and `/styleguide` renders every component with real data. Read that page before
you write any CSS.

| Where | What |
| --- | --- |
| `app/styles/tokens.css` | Colours, spacing, type, radii, shadows. Light and dark. |
| `app/globals.css` | Reset and base elements. |
| `components/ui/` | Button, Badge, Card, Field/Input/Select/Textarea, Modal, ConfirmDialog, Toast, Avatar, EmptyState, Spinner, SegmentedControl, PageHeader. |
| `components/events/` | `EventCard`, `EventGrid`, `DateBlock`, `AccessBadge`, `EventStatusBadge`, `RegistrationBadge`, `CapacityMeter`, `EventMetaLine`, `EventMetaDetails`. |
| `components/layout/` | The app shell, nav and persona switcher. |
| `lib/types.ts` | The domain model. Read this first. |
| `lib/db.ts` | Async in-memory store. Swappable for a real database. |
| `lib/seed.ts` | 12 events, 5 people, every state covered. |
| `lib/session.ts` | `getCurrentUser()` — the trusted identity on the server. |
| `lib/api.ts` | `withErrorHandling`, `ApiError`, `jsonOk`, `readJson`, `fetchJson`. |
| `lib/labels.ts` | The product's vocabulary. Import copy from here. |
| `lib/date.ts` | Date formatting and grouping. |
| `app/api/session/route.ts` | The worked example of the API house style. |

**There is no login.** Switch persona from the top right. That is how you check
your visibility rules — be Priya, and the invite-only offsite should vanish.

| Persona | Role | Use them to test |
| --- | --- | --- |
| Maya Cohen | organizer | Hosting, editing, the approval queue |
| Daniel Ross | organizer | An organizer looking at *someone else's* event |
| Priya Nair | member | The plain attendee experience |
| Tom Alvarez | member | Someone with a rejected request |
| Sara Klein | admin | Managing an event they do not host |

Data lives in memory and resets when the dev server restarts. To reset without
restarting: `curl -X POST http://localhost:3000/api/dev/reset`.

---

## 4. The rules

This is the specification. Where it is silent, use your judgement — and say what
you decided in the PR.

### Roles

| Role | May |
| --- | --- |
| `member` | Browse and register |
| `organizer` | The above, plus create events and manage the ones they host |
| `admin` | Manage every event |

A **host** is the event's `organizerId` or anyone in its `coHostIds`.

### Who can see an event

| Event | member (not invited) | invited member | host | admin |
| --- | --- | --- | --- | --- |
| `draft`, any access | no | no | yes | yes |
| `published` + `open` | yes | — | yes | yes |
| `published` + `approval` | yes | — | yes | yes |
| `published` + `invite` | **no** | yes | yes | yes |
| `cancelled` | as if published | as if published | yes | yes |

An event you cannot see should **404**, not 403. A 403 confirms it exists.

### Who can do what

| Action | member | organizer (not a host) | host | admin |
| --- | --- | --- | --- | --- |
| Create an event | no | yes | — | yes |
| Edit / delete an event | no | no | yes | yes |
| Publish a draft | no | no | yes | yes |
| Approve or reject requests | no | no | yes | yes |
| Register | yes | yes | yes | yes |

A host is not automatically an attendee. They register like everyone else.

### Registering

| Access mode | Result |
| --- | --- |
| `open` | `going` |
| `approval` | `pending` → a host makes it `going` or `rejected` |
| `invite`, and they were invited | `going` |

Registration is **closed** when any of these is true:

- the event is a `draft` or is `cancelled`;
- the event has already started;
- the event is full and its mode is `open` or `invite`.

An event is **full** when the number of `going` registrations reaches
`capacity`. `capacity: null` means unlimited. Only `going` counts — `pending`,
`cancelled` and `rejected` do not.

On an `approval` event that is full, people may still request a place, but a
host cannot approve past capacity.

### Withdrawing

Anyone who is `going` or `pending` may withdraw, which sets them to `cancelled`.
They may register again afterwards. Someone who was `rejected` may not
re-request — the host can still approve them from the queue.

---

## 5. Milestones

### M1 — The board · **must**

`/events` — the events this person is allowed to see.

- Uses `EventCard` in an `EventGrid`. Do not write a new card.
- Upcoming events first, soonest first. Past events are separate and de-emphasised.
- Each card shows the viewer's own registration status when they have one.
- Filter by category and by access mode.
- A real empty state — not a blank page.

**Done when:** switching from Maya to Priya removes the two invite-only events
from the board, and the count changes.

### M2 — The event detail screen · **must**

`/events/[id]` — one screen, three audiences.

- Everything about the event: when, where, description, hosts, capacity, who is going.
- 404 for anyone who is not allowed to see it.
- A clear call to action that reflects the viewer's actual state — register,
  request a place, withdraw, "awaiting approval", "this event is full",
  "this event has passed".
- Host-only controls appear here, and only for hosts.

**Done when:** opening an invite-only event's URL directly as Tom gives a 404.

### M3 — Register and respond · **must**

- `POST` / `DELETE` (or `PATCH`) under `/api/events/[id]/registrations`, following
  the house style in `app/api/session/route.ts`.
- Every rule in section 4 is enforced **on the server**. Assume the client lies.
- The UI updates without a full page reload, and shows errors from the server.

**Done when:** `curl`-ing the register endpoint as a member for an invite-only
event you were not invited to fails with a sensible status.

### M4 — Create and edit in place · **should**

- Hosts edit the event on the detail page. No second screen.
- Creating an event is your design call — a `/events/new` page, a modal, or
  creating a draft and landing on its detail page. Justify it in the PR.
- Deleting asks first. `ConfirmDialog` is already built.

### M5 — The approval queue · **should**

- Hosts see pending requests on the event detail page, with the requester's
  message, and can approve or reject each one.
- The counts and the attendee list update immediately.

### Stretch, in the order we would pick them up

1. **Calendar view** — a month grid on `/events`, toggled with `SegmentedControl`.
   `toDayKey()` in `lib/date.ts` is there for the grouping.
2. **Waitlist** — `waitlisted` already exists in `RegistrationStatus`. Auto-promote
   when someone withdraws.
3. **Managing invitations** — hosts add and remove invited people.
4. **Search** across title, summary and description.
5. **"My events"** — hosting, going, and awaiting approval.
6. **Optimistic UI** on the register button.
7. **A theme toggle.** The tokens already support `data-theme` on `<html>`.

---

## 6. Edge cases we will look for

Not a checklist to grind through — a hint at where the interesting decisions
are. Handling three of these well is worth more than handling all of them badly.

- The API returns invite-only events to people who were not invited.
- Authorisation checked in the component but not in the route handler.
- The client sends its own `userId` and the server believes it.
- Capacity counting `pending` or `cancelled` rows.
- Registration open on a past event, a draft, or a cancelled event.
- Switching an event from `invite` to `open` — what happens to the invite list,
  and to the people who were already going?
- Deleting an event that has registrations.
- A host approving a request that would push the event over capacity.
- A member's registration state after they withdraw and register again.
- Dates formatted differently on the server and the client (hydration warnings).

---

## 7. Definition of done

- `npm run typecheck` and `npm run lint` are clean.
- `npm run build` succeeds.
- No `any`. No unused exports. No commented-out code.
- Styling is CSS Modules using tokens — no inline colours, no new global CSS.
- New components you genuinely needed live next to the ones already there and
  look like them.
- The app works as all five personas, not just as the one you developed with.

---

## 8. Your pull request

Keep it short. We will read every one of them.

```markdown
## What I built
Which milestones, and what state each is in.

## Decisions
The two or three calls you made that someone else would have made differently.
Where creating an event lives, and why. Where the permission logic went, and why.

## What I did not do
Honest list. "M5 not started" is a fine line to have in a PR.

## How to check it
The three clicks a reviewer should make to see it working, including which
personas to switch between.
```

---

## 9. Working with Claude Code on this

The session you just sat through, applied to this task.

**Brief.** Do not paste this whole file in and say "go". Give Claude the goal and
the constraints for *one milestone*, point it at `lib/types.ts` and
`app/api/session/route.ts` as the shape to follow, and ask for a plan before any
code. A wrong plan costs thirty seconds to fix; wrong code costs ten minutes.

**Session.** Work in slices you can verify. Build M1, look at it in the browser,
switch persona, *then* move on. When you catch yourself saying "and also" for the
fourth time in one prompt, stop and split it.

**PR.** Ask Claude to write the PR description from the actual diff, then fix
what it got wrong about your intent. It knows what changed; only you know why.

**Review.** Before you open the PR, ask for a review against section 4 of this
file and section 6 above. Being specific about the standard is what makes the
answer useful — "review this" gets you a list of nitpicks; "check every route
handler enforces the visibility table in TASKS.md" finds the real bug.

**Memory.** When you correct Claude on something that will come up again — the
house API style, where permission logic belongs, that we use CSS Modules and not
Tailwind — put it in `CLAUDE.md` so you do not have to say it a third time.

---

## 10. What we will compare afterwards

Roughly in this order:

1. **Correctness of the rules.** Does the board leak? Is the API safe on its own?
2. **Where the logic lives.** Is there one place that answers "can this person
   see this event", or is that question re-answered in six files?
3. **Reuse.** Did you build on the kit, or reinvent buttons and cards?
4. **The detail screen.** How well does one screen serve an attendee and a host?
5. **How you drove Claude Code.** Your commits and your PR show this more
   clearly than you would expect.
6. **Honesty.** Whether the PR matches what the code actually does.
