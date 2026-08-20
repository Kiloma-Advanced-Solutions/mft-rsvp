# dec_ — Decisions

Every decision that shapes the code, with the reason. A decision belongs here
the moment it is made — the reason is the part that evaporates first.

Two groups: decisions that **came with the skeleton** (inherited, and we agreed
to keep them) and decisions **we made** while building.

Format: what was decided · why · what it costs · where it lives.

---

## Inherited from the skeleton

### D-01 · No database. An in-memory store shaped like a repository

**Decided:** data lives in a `Store` object on `globalThis`, rebuilt from
`lib/seed.ts`.
**Why:** the exercise is about product logic and authorisation, not about
wiring Postgres. Every method is async and reads return `structuredClone` deep
copies, so the shape is already the shape a real repository has.
**Cost:** everything resets when the dev server restarts. `POST /api/dev/reset`
restores fixtures without a restart.
**Where:** `lib/db.ts`, `lib/seed.ts`.
**Swapping later:** change `lib/db.ts` only. No call site moves.

### D-02 · No authentication. A persona cookie instead

**Decided:** identity is the `eb_persona` cookie, switched from the top-right
dropdown. `getCurrentUser()` never returns null — it falls back to
`DEFAULT_USER_ID` (`u-maya`).
**Why:** the interesting problem is *authorisation*, not a login screen. Being
able to switch persona in one click is what makes the visibility rules testable
at all.
**Cost:** no logged-out state exists, so nothing in the app handles one. Real
auth would add that branch everywhere.
**Where:** `lib/session.ts`, `components/layout/PersonaSwitcher.tsx`,
`app/api/session/route.ts`.

### D-03 · Route Handlers, not Server Actions

**Decided:** every mutation goes through `app/api/**/route.ts`. No Server
Actions anywhere.
**Why:** the authorisation boundary becomes a single, obvious, readable layer.
You can `curl` it, which is how the brief asks us to prove the API is safe on
its own.
**Cost:** more boilerplate than a Server Action, and forms need a client-side
`fetchJson` call plus a `router.refresh()` instead of a progressive-enhancement
`<form action>`.
**Where:** `CLAUDE.md`, `app/api/session/route.ts` as the worked example.
**If we ever change our minds:** that is a new decision recorded here, not a
quiet exception in one file.

### D-04 · One error shape for the whole API

**Decided:** success returns the payload as-is; failure returns
`{ error: { message, code?, details? } }`. `withErrorHandling` wraps every
export; unexpected throws become a 500 with no stack trace leaked.
**Why:** it lets the client have one `fetchJson` helper instead of bespoke
error handling at every call site, and it means a component can display the
server's message directly.
**Where:** `lib/api.ts`, and every route handler.

### D-05 · CSS Modules and design tokens. No Tailwind, no component library

**Decided:** one `.module.css` per component; every colour, space, radius,
shadow and font size comes from `app/styles/tokens.css`.
**Why:** both themes then work for free, and the app stays visually one thing.
Three runtime dependencies total.
**Cost:** more files, and you have to check `/styleguide` before inventing a
component.
**Where:** `app/styles/tokens.css`, `app/globals.css`, every `*.module.css`.

### D-06 · Copy lives in `lib/labels.ts`

**Decided:** user-facing strings are imported, not typed into JSX.
**Why:** so the board and the detail page can never disagree about what a
pending request is called. "Awaiting approval" is one string in one place.
**Cost:** one indirection between reading JSX and reading the words.

### D-07 · Dates formatted with a pinned `en-GB` locale

**Decided:** every `Intl.DateTimeFormat` in `lib/date.ts` uses a fixed locale.
**Why:** formatting with the ambient locale makes the server and the browser
disagree, which surfaces as a React hydration warning that is genuinely
painful to track down. `toDayKey()` uses local getters rather than
`toISOString()` for the same class of reason — UTC would move an evening event
to the next day.
**Cost:** no per-user locale. Fine for an internal tool.

### D-08 · A flat `EventLocation`, not a discriminated union

**Decided:** `{ kind, venue?, address?, url?, platform? }`, with `kind`
deciding which optional fields are meaningful.
**Why:** one form can edit it without swapping field sets when the kind
changes.
**Cost:** the type does not enforce "an online event has a `url`". That has to
be validated in the route handler.

---

## Decisions we made

### D-09 · Permissions live in one module, called from both sides

**Decided:** `canViewEvent()` and `canManageEvent()` (plus `isHost`,
`isInvited`) in `lib/permissions.ts`. Pages call them to decide what to render;
route handlers will call the *same* functions to decide what to return.
**Why:** the brief compares projects on exactly this — "is there one place that
answers 'can this person see this event', or is that question re-answered in
six files". One place also means the visibility table in section 4 of
`TASKS.md` can be read against a single function.
**Shape:** pure functions over records already loaded — no I/O, no framework
import. They keep working when `lib/db.ts` is swapped, and they are trivially
testable.
**Rule order in `canViewEvent`** (the order matters):
1. admins and hosts see everything, drafts included;
2. drafts — nobody else;
3. `invite` — invited people only;
4. anything else — everyone.
A `cancelled` event stays visible to whoever could see it while published,
which falls out of that ordering instead of needing its own case.
**Where:** `lib/permissions.ts`. Added in "create events page with filtering".

### D-10 · The board is filtered on the server, before rendering

**Decided:** `getBoard(viewer, filters)` runs `canViewEvent()` over the whole
store and returns only what this person may see.
**Why:** section 1 of the brief — the board must never leak. Filtering in the
browser does not count; a hidden card is still in the HTML and still in the
JSON. This also makes `visibleCount` an honest number.
**Cost:** every board render reads the whole store. Irrelevant at 12 events;
becomes a query when the store is real.
**Where:** `lib/events.ts` → `getBoard`.

### D-11 · Filters live in the query string, not in component state

**Decided:** `?category=design&access=open`, parsed by
`lib/board-filters.ts`, applied on the server.
**Why:** a filtered board survives a reload, can be sent to someone, and — the
real reason — the server never has to ship events the viewer may not see just
so the browser can hide them again.
**Cost:** each filter change is a navigation, not a local state update.
**Detail:** unknown values are dropped rather than 404ing, so a stale or
hand-edited link still shows a board, just an unfiltered one.
**Detail:** `lib/board-filters.ts` deliberately imports nothing from `lib/db.ts`
so the page *and* the client-side `EventFilters` can both use it.
**Where:** `lib/board-filters.ts`, `app/events/page.tsx`,
`components/events/EventFilters.tsx`.

### D-12 · Access counts are computed within the chosen category

**Decided:** the category filter is applied first; the per-access counts shown
in the filter bar describe that category, not the whole board.
**Why:** so clicking a mode always shows what the number promised. A count of
"Open · 4" that yields 1 result is a small lie the user notices immediately.
**Where:** `lib/events.ts` → `getBoard`, the `inCategory` step.

### D-13 · "Past" means started, not ended

**Decided:** an event moves to the past section once `startsAt` is in the past.
**Why:** it is the same line `EventCard` uses to dim itself and the same one
that closes registration. Three definitions of "past" in one app is how the
board and the button end up disagreeing.
**Detail:** the split reads the clock, which is only safe because it runs on
the server. Doing it during a client render would drift from what the server
sent and show up as a hydration mismatch.
**Where:** `lib/events.ts` → `splitByTime`, `lib/date.ts` → `isPast`.

### D-14 · Derived facts are computed once, in the service layer

**Decided:** hosts, `goingCount`, `pendingCount`, the viewer's registration and
`viewerCanManage` are all produced by `toBoardEvent()` in `lib/events.ts`, not
by the components that display them.
**Why:** `goingCount` in particular is a rule, not a number — only `going`
counts against capacity. Recomputing it in a component is how `pending` ends up
being counted somewhere.
**Where:** `lib/events.ts` → `toBoardEvent`.

### D-15 · A memory bank in `docs/`, on its own branch

**Decided:** the eight `docs/*.md` files, written on `alona/memory-bank`.
**Why:** `CLAUDE.md` should stay short enough that Claude reads it on every
turn; the reasoning behind the rules needs somewhere to live that is not the
brief and not the code. Splitting by prefix (`a_`, `c_`, `d_`, `dec_`, `s_`,
`r_`, `u_`, `f_`) means a session can load only the file it needs.
**Cost:** it goes stale unless updated at the end of each session. That is the
last item on the session checklist in `s_sessions.md`.

---

## Decisions still open

These have to be made and will land here when they are.

| Open question | Where it bites | Notes |
| --- | --- | --- |
| Where creating an event lives — `/events/new`, a modal, or "create a draft and land on its detail page" | M4 | The brief asks us to justify it in the PR. Creating a draft and landing on the detail page is the most consistent with "there is no separate edit screen" |
| Does the detail data go through a `getEventForViewer()` in `lib/events.ts`, or does the page call `db` + `canViewEvent` itself | M2 | A service function keeps the page thin and gives the API route the same entry point |
| Where the registration rules live — "is registration open", "what status does registering produce", "is this event full" | M3 | Proposed: a `lib/registration.ts` alongside `permissions.ts`, called by the route handler *and* by whatever renders the button |
| What happens to `invitedUserIds` when an event switches from `invite` to `open`, and to the people already `going` | M4 | Named explicitly in section 6 of the brief as something reviewers look for |
| Whether deleting an event with registrations is allowed at all, or only cancelling | M4 | `db.events.remove()` already cascades to registrations |
| Optimistic UI on the register button, or refresh-after-response | M3 | Refresh is simpler and cannot lie about the result. Optimistic is a listed stretch goal |
