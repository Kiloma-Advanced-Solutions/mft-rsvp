# Brief — M1: The Events Board

Scope: the first milestone only (`/events`). The detail screen, registration
endpoints, creation/editing and the approval queue are explicitly out of scope
and listed at the bottom.

> **Do not commit and push anything without my permission.** Write the code, run the
> checks, show me the diff — then ask. This applies to every commit, every
> branch, every push and every PR, for the whole of this project. Do not
> `git add`, `git commit`, `git push`, or open a PR on your own initiative,
> and do not treat approval of one commit as approval of the next.
>
> **Do not make decisions on your own.** Where this brief is silent, where two
> approaches are both defensible, or where something turns out differently than
> written — stop and ask, and we decide together. Do not pick the sensible
> default and carry on, and do not bury the choice in the code for me to find
> later. This applies to the brief itself as much as to the development that
> follows it.

---

## Goal

Build `/events` page— the board that shows the current persona exactly the events
they are permitted to see, and nothing else.

**Product context.** An internal events board with two halves. *Management:*
authorised people create, edit and delete events, each of which opens up in one
of three ways (`open`, `approval`, `invite`). 
*Discovery:*
everyone else browses what they are permitted to see and registers for what they want.

**Roles** (from `TASKS.md` §4 — the authoritative table):
1. Member - may browse and register - test with personas: Priya Nair, Tom Alvarez
2. Organizer - may browse, register, create events and manage the ones they host - test with personas: Maya Cohen (hosts), Daniel Ross (someone else's event)
3. Admim - may browse, register, create events and manage every event - test with persona: ara Klein

A **host** is the event's `organizerId` or anyone in `coHostIds`.

**What the board must do**

1. Show the permitted set of events for the current persona, as described above and depends on the event visibility: 
  a. draft (any access) -> only host and admin
  b. published and open -> host and admin can do everything, member (invited or not invited) can view and register.
  c. published + approval -> host and admin can do everything, member (invited or not invited) can view and request to register.
  d. published + invite -> host and admin can do everything, invited member can view and request to register, not invited member cannot is denied from accessing this event.
  e. cancelled -> host and admin can do everything, member (invited or not invited) - as in published. 

2. Render the events with the existing `EventCard` inside `EventGrid`. **No replacement card is to be written.**
3. Show upcoming events first, soonest first. Past events in a separate section below.
4. Each card shows the viewer's own registration status where one exists.
5. Filter by category and by access mode.
6. A considered empty state — never a blank page.
Two cases: nothing visible at all, and nothing matching the current filters (which must offer a way back).

**The non-negotiable constraint: the board must not leak.**
An invite-only event
a person was not invited to does not appear on their board *and does not appear
in any server response that reaches their browser*. Filtering in the browser
does not satisfy this. The filter therefore runs on the server, before render.

(The project's other standing constraint — that hosts edit on the event's own
detail page and there is no separate edit screen — is an M2/M4 concern. Its only
consequence here: a card is a link to `/events/[id]` and nothing else.)

**Identity:**
There is no authentication for now. The persona switcher in the top right
sets a cookie the server reads on every request; `getCurrentUser()` in `lib/session.ts` is the only source of identity on the server. Switching persona
is the means by which visibility rules are verified.

**Decisions we made together.** Settled before any code is written, and repeated
in the PR. Anything not covered here is still an open question — ask, do not
assume.

| # | Decision | Consequence |
| --- | --- | --- |
| **D1** | Filter state lives in the **URL search params** (`?category=…&access=…`). | The page stays a Server Component and filters on the server. Filtered views are linkable and survive a reload. Each filter change is a server round-trip — acceptable. |
| **D2** | The access-mode filter offers **only the modes present in what this viewer can see**. | Priya and Tom are never offered "Invite only". The control's shape varies by persona, which is accepted. |
| **D3** | A host's own `draft` events sit in **their own section**, separate from the board proper. | Three sections on the page: drafts (hosts/admins only, and only when they have some), upcoming, past. Unpublished work is never mixed in with things people can register for. |

Note on D1: it interacts with the leak constraint, but does not soften it. The
*permitted set* is decided on the server regardless; D1 only settles where the
category and access filtering happens on top of that set.

---

## Files

### Read first — do not modify

| File | Why |
| --- | --- |
| `lib/types.ts` | The domain model. `EventWithContext` is the shape the board should build per card. Read before anything else. |
| `TASKS.md` §4 | The visibility and permission tables. The specification. |
| `lib/db.ts` | `db.events.list()`, `db.registrations.list()`, `db.users.list()`. Async, server only. |
| `lib/session.ts` | `getCurrentUser()`. |
| `lib/seed.ts` | 12 events, 5 people. Gives the expected counts in the test plan. |
| `lib/labels.ts` | `CATEGORY_LABELS`, `CATEGORY_ORDER`, `ACCESS_LABELS`, `REGISTRATION_LABELS`. All user-facing words come from here. |
| `lib/date.ts` | `isPast()`, `formatRelativeDay()`, `toDayKey()`. |
| `components/events/EventCard.tsx` | Exports **both** `EventCard` and `EventGrid`. |
| `components/events/EventMeta.tsx` | Exports `DateBlock`, `AccessBadge`, `EventStatusBadge`, `RegistrationBadge`, `EventMetaLine`, `EventMetaDetails`. Already used inside the card. |
| `components/ui/index.ts` | The kit barrel: `PageHeader`, `EmptyState`, `SegmentedControl`, `Select`, `Button`, `Badge`… |
| `app/styles/tokens.css` | Every colour, space, radius and font size. |
| `/styleguide` | Renders the whole kit with real data. Look here before writing CSS. |

### To create

| File | Contents |
| --- | --- |
| `lib/access.ts` | **The single place that answers the permission questions.** `isHost(user, event)`, `canViewEvent(user, event)`, `canManageEvent(user, event)`, `visibleEvents(user, events)`. Server only, pure functions over `User` and `EventRecord`. Nothing else in the app re-answers these questions. |
| `lib/events.ts` | Builds `EventWithContext` for a viewer: hosts, `goingCount` (only `going` counts — not `pending`, `cancelled`, `rejected` or `waitlisted`), `pendingCount`, the viewer's own registration, `viewerCanManage`. Also the three-way split (drafts / upcoming / past, per D3) and the sort. Server only. |
| `components/events/BoardFilters.tsx` + `.module.css` | `"use client"` leaf. Category and access-mode controls that write to the URL search params (D1). Labels come from `lib/labels.ts`. Presentational: it is handed its option lists, which the server derives from the viewer's visible set (D2). |
| `app/events/events.module.css` | Page-level layout: the three sections, their headings, and the de-emphasis on past events. Tokens only. |

### To change

| File | Change |
| --- | --- |
| `app/events/page.tsx` | Replace the stub. Server Component: `getCurrentUser()` → load → `visibleEvents()` → derive the filter options (D2) → apply the search-param filters (D1) → split drafts / upcoming / past (D3) → sort → render `PageHeader`, `BoardFilters`, up to three `EventGrid`s, `EmptyState`. |

### Not to be touched in M1

`app/globals.css`, `app/styles/tokens.css`, anything in `components/ui/`, the
existing `components/events/` files, `lib/db.ts`, `lib/seed.ts`. No new
dependencies.

---

## Test Plan

Run `npm run dev`, open <http://localhost:3000/events>, and switch persona from
the top right. `curl -X POST http://localhost:3000/api/dev/reset` restores the
fixtures without a restart.

### 1. The visibility table, persona by persona

The seed has 12 events: one `draft` (Internal Hack Day, hosted by Maya), two
`invite` (Leadership Offsite — Sara hosts, Maya and Daniel invited; Compensation
Review Sync — Sara hosts, Maya invited), two in the past (Sprint 42 Retro,
New Hire Welcome Breakfast) and one upcoming `cancelled` (Checkout Postmortem).

Sections per D3: drafts, then upcoming, then past.

| Persona | Role | Total visible | Drafts | Upcoming | Past | Must **not** see |
| --- | --- | --- | --- | --- | --- | --- |
| Maya Cohen | organizer | 12 | 1 | 9 | 2 | — |
| Daniel Ross | organizer | 10 | 0 | 8 | 2 | Compensation Review Sync, Internal Hack Day |
| Priya Nair | member | 9 | 0 | 7 | 2 | both invite-only events, Internal Hack Day |
| Tom Alvarez | member | 9 | 0 | 7 | 2 | both invite-only events, Internal Hack Day |
| Sara Klein | admin | 12 | 1 | 9 | 2 | — |

Where a persona has no drafts, the drafts section is absent entirely — not an
empty heading.

**The headline check:** switching Maya → Priya removes the two invite-only
events from the board and the count changes.

### 2. The board must not leak

- As Priya, view source / the network response for `/events`. The strings
  "Leadership Offsite" and "Compensation Review" must not appear anywhere in the
  payload — not hidden by CSS, not filtered in the browser.
- Confirm the same for the draft "Internal Hack Day".
- Confirm `visibleEvents()` is the only filter in play: grepping for
  `access === "invite"` outside `lib/access.ts` should return nothing.

### 3. Ordering and grouping

- Upcoming events appear before past ones, soonest first.
- Past events sit in their own clearly-labelled, visually de-emphasised section.
- The cancelled Checkout Postmortem is still listed (it is upcoming) and reads
  as cancelled via `EventStatusBadge`.
- As Maya and as Sara, Internal Hack Day appears in the drafts section only —
  never among upcoming events — badged as a draft.
- As Daniel, Priya and Tom, there is no drafts section at all.

### 4. The viewer's own status on the card

- As Priya: Engineering All-Hands shows "Going"; TypeScript Deep Dive shows her
  status; events she has no registration for show no registration badge.
- As Tom: his rejected request on Design Critique surfaces as "Rejected".
- Switching persona changes which cards carry a badge — the status is the
  *viewer's*, never the host's.

### 5. Filtering

- Category filter narrows the grid; the counts move with it.
- Access-mode filter narrows the grid.
- Filters combine and can be cleared.
- Filtering to an empty result shows the "no matches" empty state with a way to
  clear the filters — not the "nothing visible" one.
- As Priya and Tom, "Invite only" is **not offered** as an access-mode option
  (D2). As Maya it is offered, because she can see two of them.
- Filters appear in the URL and survive a reload; pasting a filtered URL into a
  new tab reproduces the same view (D1).
- Pasting Maya's filtered URL while switched to Priya still shows only Priya's
  permitted events — the URL selects a view, it never widens the permitted set.

### 6. Empty state

- Filter down to zero results and confirm a real empty state renders (`EmptyState`
  from the kit), with a route back.

### 7. Chrome

- Light and dark both work (tokens handle this if no hex codes were written).
- Narrow the window: the grid reflows and nothing overflows.
- Browser console is clean — in particular no hydration warnings from dates
  formatted differently on the server and the client.

---

## Definition Of Done

- All of `npm run typecheck`, `npm run lint`, `npm run build` are clean.
- Every row of the persona table above is verified by hand, by switching
  persona — not by reasoning about the code.
- The board does not leak: the invite-only and draft events are absent from the
  server response, not hidden in the browser.
- `EventCard` and `EventGrid` are used as they are. No replacement card, no
  forked copy, no new button or badge that duplicates the kit.
- Exactly one place — `lib/access.ts` — answers "can this person see this event"
  and "can this person manage this event".
- Only the leaf filter component is `"use client"`. The page is a Server
  Component.
- Styling is CSS Modules using tokens from `app/styles/tokens.css`. No hex
  codes, no magic pixel values, nothing added to `app/globals.css`.
- All user-facing words come from `lib/labels.ts`.
- No `any`, no unused exports, no commented-out code.
- Commits are small and readable, and **each one was approved by me before it
  was made**. The PR says which milestone this is and what state it is in.

---

## Out Of Scope

Not in this milestone. Do not start them, do not stub them, do not add "for
later" abstractions to accommodate them.

- **M2 — the event detail screen.** `/events/[id]` keeps its stub. Cards link to
  it and that is all M1 owes it.
- **M3 — register and respond.** No `/api/events/[id]/registrations`, no
  register/withdraw buttons. Cards are a single link with no interactive
  controls inside them.
- **M4 — create and edit in place.** No creation route, no modal, no host
  controls on the board, and above all no separate edit screen — ever.
- **M5 — the approval queue.**
- **Stretch, in the order we would pick them up:** calendar view on `/events`
  toggled with `SegmentedControl`; waitlist and auto-promotion; managing
  invitations; search across title/summary/description; a "My events" view;
  optimistic UI; a theme toggle.
- **Not in this project at all:** real authentication, a real database, any new
  dependency, Tailwind or any CSS-in-JS, any component library.
