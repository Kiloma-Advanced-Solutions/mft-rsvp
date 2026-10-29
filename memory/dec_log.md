# Decision Log

Append-only record of cross-cutting implementation decisions and the reasoning
behind them, for decisions whose rationale would otherwise be lost.

## When a decision belongs here

Add an entry when all three are true:

- several reasonable options existed;
- one was deliberately chosen;
- understanding *why* will matter to a later milestone or review.

Do not add:

- architecture facts that already have a home — those belong in
  [a_system.md](a_system.md) or the code;
- routine implementation detail with no real alternative;
- a **planned** decision written up as though it were done. An entry is added
  after the decision is implemented, not when it is proposed.

## Where decisions live instead

Much of this project's rationale is already written where it applies, and stays
there:

- the persistence boundary, the application's ownership of ids and
  timestamps, and the narrowed registration writes →
  [lib/db.ts](../lib/db.ts) header;
- the seat-claim protocol, its locking and why no range lock is needed →
  [lib/data/seats.ts](../lib/data/seats.ts) header;
- a duplicate key as a domain outcome, and a deadlock deliberately not →
  [lib/data/errors.ts](../lib/data/errors.ts) header;
- the cached application pool and its lifecycle →
  [lib/data/client.ts](../lib/data/client.ts) header;
- the SQL Server feature floor, the rejected constructs and the shared-database
  rules → [docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md);
- cookie personas instead of authentication →
  [lib/session.ts](../lib/session.ts) header;
- the locale pinned to `he-IL` to avoid hydration mismatch →
  [lib/date.ts](../lib/date.ts) header;
- route handlers rather than Server Actions, and the styling rules →
  [CLAUDE.md](../CLAUDE.md).

This log links to those rather than restating them. Per-change narrative belongs
in the pull request description ([TASKS.md](../TASKS.md) §8).

## Entry format

```text
## YYYY-MM-DD — Decision title

Context:
Decision:
Rationale:
Consequences:
```

Entries are appended newest-last. Existing entries are never edited; if a
decision is reversed, add a new entry that references the one it supersedes.

---

## 2026-08-20 — Memory Bank as MEMORY.md plus a four-file `memory/`

Context: the repository has four strong authoritative files (`TASKS.md`,
`CLAUDE.md`, `README.md`, and a heavily commented `lib/`), but nothing that routes
a fresh session to the right one, and nowhere to record volatile project position.
Three structures were on the table: a single `MEMORY.md` holding everything; the
full `a_/c_/d_/dec_/s_/r_/u_` taxonomy; or a reduced middle ground.

Decision: one root `MEMORY.md` for navigation, plus `memory/` holding exactly
`a_system.md`, `d_glossary.md`, `dec_log.md` and `s_status.md`. The taxonomy files
that would have been mostly links were not created — conventions stay in
`CLAUDE.md`, the backlog stays in `TASKS.md`, references are the navigation index
itself, and environment facts stay in `.claude/*`, `README.md` and `TASKS.md`.

Rationale: the single-file version mixes stable orientation with volatile status,
so routine status edits would churn the whole file. The full taxonomy creates
files whose content is a paraphrase of an existing authoritative file, which is
how documentation goes stale. Four files draw the line at the four kinds of memory
the repository genuinely lacks: system shape, terminology, rationale, and current
state.

Consequences: `s_status.md` is the only file expected to change routinely, and it
is rewritten in place rather than appended to. Everything else changes only when
the thing it describes changes. Adding a fifth memory file needs a reason that
`MEMORY.md`, an existing memory file, or a repository file cannot already serve.

---

## 2026-08-23 — Complete taxonomy and move MEMORY.md into memory/

Context: after reviewing the Memory Bank methodology, we decided to represent all
seven taxonomy categories rather than only the four the previous entry selected.
The concern that drove that earlier choice — files whose content is a paraphrase of
an authoritative source — is answered by keeping the additional files lightweight
and routing-oriented rather than by omitting them.

Decision: `MEMORY.md` lives inside `memory/`, so the Memory Bank is one directory
with a single entry point and no root-level duplicate. All seven taxonomy
categories are represented: `a_system.md`, `c_conventions.md`, `d_glossary.md`,
`dec_log.md`, `s_status.md`, `r_references.md` and `u_environment.md`.
`c_conventions.md`, `r_references.md` and `u_environment.md` are intentionally
lightweight and primarily point to authoritative repository sources rather than
explaining anything themselves.

Rationale: this preserves the full Memory Bank taxonomy while still enforcing the
principles that made the reduced structure attractive — one home per fact,
references over duplication, progressive disclosure in the reading order, and
existing repository files as the authoritative sources of truth. A category earns
a file; it does not earn content it does not own.

Consequences: this entry supersedes the Memory Bank structure described in the
2026-08-20 entry above, which does not invalidate that entry's historical
rationale — the reasoning about paraphrase and staleness still governs how the
three added files are kept small. `MEMORY.md` is referenced as `memory/MEMORY.md`
from here on, and the three lightweight files are held to a routing-only standard:
if one starts explaining rather than pointing, the explanation belongs in its
authoritative source instead.

---

## 2026-08-24 — Permission rules kept separate from event loading

Context: M1 was the first code that had to answer "may this viewer see this
event". The check could have lived in the board page, in the module that loads
events, or in a module of its own.

Decision: [lib/permissions.ts](../lib/permissions.ts) holds `canViewEvent()` and
`canManageEvent()` as pure functions of (event, viewer).
[lib/events.ts](../lib/events.ts) loads data and calls them; it decides nothing
itself.

Rationale: every later milestone asks the same two questions from somewhere else
— the detail-page 404, host-only controls, the registration routes — and
[CLAUDE.md](../CLAUDE.md) requires a single shared answer for both pages and API
routes. Keeping the rules free of the store and the session lets them be read
against [TASKS.md](../TASKS.md) §4 on their own, and stops a route handler from
reaching a different answer than a page.

Consequences: M2 and M3 extend these functions instead of writing their own
checks, and a rule change has one place to land. Anything that needs the store
belongs in `lib/events.ts`, not here.

---

## 2026-08-24 — Board filters in the URL, applied on the server, with no `/api/events`

Context: M1 needs category and access filters. The alternatives were client-side
filtering over a fetched list, local component state, or filter values in the
query string applied during the server render.

Decision: filters live in the URL and are applied on the server to the set the
viewer is already authorised to see. No `/api/events` endpoint was added;
`BoardFilters` is a client leaf that only navigates.

Rationale: filtering in the browser would mean sending events the viewer may not
see and hiding them there — exactly the leak [TASKS.md](../TASKS.md) §1 forbids.
Applying filters after authorisation means the query string can only narrow what
the viewer could already see, never widen it. The URL also keeps the page a
Server Component, and makes a filtered board shareable and the Back button
meaningful. No M1 requirement needed an endpoint, and adding one early would have
created a second place for visibility to be enforced.

Consequences: route handlers arrive in M3, when mutations genuinely need them,
reusing `lib/permissions.ts`. If a later board feature does need an endpoint, it
goes through the same permission helpers rather than re-deriving visibility.

---

## 2026-08-26 — The detail loader returns `null`; the caller chooses the response

Context: M2 needed the detail route to answer for an event that does not exist
and for one the viewer may not see. [TASKS.md](../TASKS.md) §4 settles what the
answer is; what was open was who decides it. The loader could throw
`notFound()` itself, return a discriminated error describing which case it hit,
or return `null` and leave the response to its caller.

Decision: `getEventDetailForViewer()` in [lib/events.ts](../lib/events.ts)
returns `null` for missing and invisible alike, and the page calls `notFound()`.

Rationale: the two cases have to be indistinguishable, so collapsing them in the
loader is the honest shape — a discriminated error would invite a caller to
report which one it was. Leaving the response to the caller is what keeps the
module free of `next/navigation`, so M3's route handlers can turn the same
answer into an `ApiError` instead of a rendered page, from the same single
authorisation decision. Throwing from the loader would have forced M3 either to
re-check visibility or to write a second loader.

Consequences: the visibility check has one home for both the page and the future
routes, and this is the 2026-08-24 entry's principle — permission rules separate
from event loading — applied to a second loader rather than a new decision.
`null` now carries meaning at that boundary; a caller that treats it as "not
found" only is still correct, and a caller that leaks the difference is not.

---

## 2026-08-26 — Registration availability lives in the shared rules layer

Context: M2 had to render "register", "request a place", "withdraw", "this event
is full" and "this event has passed" correctly, which meant implementing
§4's registering and withdrawing rules for the first time. They could have gone
inline in the detail page, into a new `lib/registration.ts`, or alongside the
existing checks in [lib/permissions.ts](../lib/permissions.ts).

Decision: `getRegistrationAvailability()` joined the existing two functions in
`lib/permissions.ts`, returning a union of the states rather than a set of
booleans. The page calls it and chooses wording from
[lib/labels.ts](../lib/labels.ts); it derives nothing.

Rationale: M3 has to enforce the same rules on the server, and a page-local copy
is exactly the duplication [CLAUDE.md](../CLAUDE.md) and §10 warn about — the
question would then be answered twice and could diverge. A separate module would
have split one section of the specification across two files for no gain. The
union shape is what makes it impossible to render an action and a reason not to
act at the same time. This is also the 2026-08-24 entry's stated expectation
arriving: later milestones extend these functions rather than writing their own.

Consequences: the module is no longer strictly pure — availability reads the
clock through `isPast` to decide whether an event has started. Still no store
and no session, so the trusted-identity boundary is unmoved, but the "no I/O,
no side inputs" description it once had is not accurate any more. M3 reuses
this function rather than restating the rules.

---

## 2026-08-26 — Invite-only registration admits invited users or managers

Context: [TASKS.md](../TASKS.md) §4 is genuinely ambiguous for a host of an
invite-only event who is not on its invite list. Its action table grants hosts
"register: yes"; its registering table confirms people who were invited. The
seeded leadership offsite is exactly this case — its organizer is not among its
invited users.

Decision: for `invite` access, registration is available to an explicitly
invited user **or** to anyone `canManageEvent()` allows. A host or admin may
therefore take a place at an invite-only event without appearing on its invite
list.

Rationale: the alternative reading — that a host must add themselves to the
invite list first — makes the organizer of an event unable to attend it until
they edit it, which reads as a bug rather than a rule. Whoever may manage the
event could add themselves to that list anyway, so refusing them is a formality
with no protection behind it. This is a product decision taken where the
specification is silent, which §4 explicitly permits.

Consequences: M3's registration route must enforce the same reading, and M4's
access-mode editing should not assume the invite list is the only path in. The
availability union keeps a `not_invited` state that the current UI cannot reach:
an uninvited non-manager cannot see the event at all, so the route 404s before
availability is ever computed. It is kept deliberately — it is the negative half
of the same rule, and without it the function would answer "register" if it were
ever called without a prior visibility check. M4 makes it reachable, when hosts
can change an event's access mode under people who were already registered.

---

## 2026-08-30 — One registration row per person and event, transitioned rather than replaced

Context: M3 had to make withdrawal and re-registration work.
[TASKS.md](../TASKS.md) §4 settles the statuses — withdrawing sets `cancelled`,
and someone who withdrew may register again — but not what happens to the row.
`db.registrations` offers `remove()` as well as `update()`, so deleting and
recreating was available, as was leaving the withdrawn row alone and creating a
second one on the way back in.

Decision: a person has at most one registration per event, and it is transitioned
in place. Withdrawing updates the row to `cancelled` instead of deleting it, and
registering again revives that same row rather than adding another. A revived row
starts a new cycle, so the previous cycle's `decidedBy`, `decidedAt` and `message`
are cleared as part of the same update.

Rationale: `db.registrations.find()` is built on "at most one per event", and a
second row would break the invariant every count and lookup already assumes —
`goingCount`, the viewer's own status, the attendee list. Deleting instead of
transitioning would throw away the fact that the person was once going, which is
history a host may want and which §4 does not ask us to discard. Clearing the
carried-over fields is what makes the revived row honest: a stale decision would
show M5's queue a request as already decided when it has only just been made, and
a stale message would put words the requester wrote for the previous cycle under a
request they have not written one for.

Consequences: capacity and the attendee list stay correct across any number of
withdraw/re-register cycles without special cases. M5 reads `decidedBy`/`decidedAt`
and the message to build its queue, and can trust that anything present belongs to
the current cycle.

---

## 2026-08-30 — Mutations in a focused client leaf, with the server-rendered view as the truth

Context: M2 left the registration call to action inert and server-rendered. Making
it act needed a client boundary somewhere. `RegistrationPanel` could have become a
Client Component — its own M2 comment anticipated exactly that — or the boundary
could be pushed down to the control itself.

Decision: [components/events/RegistrationActions.tsx](../components/events/RegistrationActions.tsx)
is a small Client Component holding interaction only; `RegistrationPanel` and the
detail page stay server-rendered. After a mutation the leaf calls
`router.refresh()` so the server re-renders and becomes authoritative again, and
it does so after a failure as well as a success. The control stays busy until that
refresh has landed. No optimistic state.

Rationale: [CLAUDE.md](../CLAUDE.md) puts `"use client"` at the leaf that needs it,
and marking the panel would have pushed the whole panel and its imports across the
boundary for one `onClick`. Refreshing on failure matters as much as on success: a
refusal usually means the page it was clicked from is out of date, and the refresh
is what replaces it with the truth rather than leaving a wrong page on screen.
Staying busy through the refresh closes the window between the response arriving
and the new state rendering, in which the control would be clickable while still
showing an action the store had already moved past — a second click there sends
something the viewer has already done. Optimistic state would mean the client
predicting an authorisation outcome, which is the opposite of what this milestone
is for.

Consequences: M4's editing and publishing controls and M5's approve/reject
controls follow this shape — a focused leaf, the server re-derives and decides,
the view refreshes, the control stays busy until it has. The pattern is described
in [a_system.md](a_system.md); `PersonaSwitcher` remains the simpler example of
the same path without an authorisation step.

---

## 2026-08-30 — Withdrawal is closed by the same event-level rules that close registering

Context: [TASKS.md](../TASKS.md) §4 states the withdrawing rule without an
event-state qualifier — anyone `going` or `pending` may withdraw — while
separately closing registration on draft, cancelled and already-started events.
Whether that closure also covers withdrawal is genuinely not stated, and the
seeded fixtures reach it: Tom is `going` on a cancelled event, and Priya on one
that has passed.

Decision: withdrawal follows the same closure. `getRegistrationAvailability()`
checks the event's state before the viewer's own, so a draft, a cancelled event or
one that has already started refuses both directions, and the route inherits that
by reusing the function.

Rationale: the alternative reading needs a second, withdrawal-specific rule, and
then the same question has two implementations that can drift — the exact
duplication the 2026-08-26 entry created the shared rules layer to prevent. It is
also what the M2 screen already showed: a past event you attended reads "This event
has passed" and offers no Withdraw button, so the API agreeing with it costs
nothing and disagreeing would be a bug. Freeing a place on an event that is over or
cancelled achieves nothing anyway.

Consequences: a stale `going` row on a cancelled or past event cannot be cleared by
its owner; if that is ever wanted it is a host-side action, not a withdrawal. The
UI and the API cannot disagree about whether withdrawal is offered, because one
function answers for both. This is a product decision taken where the specification
is silent, which §4 explicitly permits.

---

## 2026-08-30 — The final-seat capacity race is accepted, not solved

Context: the registration route reads the `going` count and writes the row with
`await` points in between, because [lib/db.ts](../lib/db.ts) is async by design so
it can be swapped for a real database. Two requests for the last seat can
therefore both pass the capacity check before either writes.

Decision: M3 accepts the race and does not redesign the data layer. Two options
were considered and rejected: re-reading the count immediately before the write,
and adding a check-and-write store method that completes in one tick.

Rationale: re-reading narrows the window without closing it — there is still an
`await` in between — which is worse than leaving it alone, because it looks like a
fix and would discourage a real one. A store-level reservation would close it, but
it pushes a business rule into the storage layer that
[lib/permissions.ts](../lib/permissions.ts) exists to keep out, and it means
rewriting a supplied module that [TASKS.md](../TASKS.md) §3 says not to rebuild. In
a real database this is a constraint or a transaction, not application code, so the
honest position is to name the limitation rather than paper over it.

Consequences: the limitation is documented rather than hidden, and a later session
should not treat it as a newly discovered bug or quietly redesign the store to
"fix" it. M5 meets the same question from the other side when it enforces that a
host cannot approve past capacity, and should decide it deliberately rather than by
accident. If the store is ever swapped for a real database, this is the first thing
a constraint should cover.

---

## 2026-09-01 — Creating an event has its own route; editing one does not

Context: [TASKS.md](../TASKS.md) §5 leaves M4's creation flow open and names three
candidates — a `/events/new` page, a modal, or creating a draft immediately and
landing on its detail page. §1 separately forbids a second edit screen.

Decision: creation lives at `/events/new` and produces a `draft`, after which the
host continues on `/events/[id]` like any other event. Editing an existing event
stays on `/events/[id]`.

Rationale: the no-second-screen constraint is about *editing*, and it is met — an
event that exists is only ever edited in place. Creation is a different case,
because there is no detail page to edit until the event exists. Unlike creating a
draft up front, the route writes nothing until the host has given valid data:
that option would have to invent `startsAt` and `endsAt` for an event nobody has
described, and would leave abandoned untitled drafts behind. A modal would put
creation state on a board whose state deliberately lives in the URL, and would
give the permission no address to test —
whereas `/events/new` is checkable the way every other rule here is, by opening
it as a member and getting a 404.

Consequences: `/events/new` is the only route outside `/events/[id]` that renders
an event form, and it must stay that way; anything that edits an existing event
belongs on the detail page. Both use one `EventForm`, so a new field is added
once.

---

## 2026-09-01 — Edit mode is URL state on the detail page

Context: the detail page had to grow an editing mode without becoming a Client
Component or gaining a sibling route. The mode could have been a client
`useState` flag with the read view passed in as children, or a query parameter.

Decision: `?edit=1` on `/events/[id]`, gated on `canManageEvent()` during the
server render.

Rationale: this is the 2026-08-24 board-filters decision applied again — state in
the URL, applied on the server. It keeps the page a Server Component, so the
form's initial values come from the same render that authorises it; Cancel is a
plain link; and refresh and Back behave. Most importantly the mode is authorised
on the server rather than toggled in the browser: a member appending `?edit=1`
gets the ordinary read view, and the form is absent from the markup rather than
hidden in it.

Consequences: leaving edit mode is a navigation, and Cancel discards unsaved
input by design. A future mode on this page (M5's queue, say) should ask whether
it is URL state before reaching for a client flag.

---

## 2026-09-01 — Content, lifecycle and ownership are separate write paths

Context: M4 needed create, edit, publish and delete. Publishing is a one-field
change and could have been a `status` value accepted by the content `PATCH`.

Decision: `PATCH /api/events/[id]` edits content only. Publishing is its own
bodyless `POST /api/events/[id]/publish`. Ownership and system fields —
`status`, `accent`, `organizerId`, `coHostIds`, `invitedUserIds` — are **absent
from the shared input parser**, so no request body can reach them.

Rationale: the registrations route already established the shape — a sub-resource
route performing one authorised transition, reading no body at all — and
publishing is the same shape. Keeping it separate means the content editor holds
no lifecycle logic, and one status code keeps one meaning per endpoint. The
stronger property is structural: a field that the parser does not read cannot be
smuggled through, which is a better guarantee than a field that is read and then
validated.

Consequences: adding a host-editable field means adding it to the parser
deliberately, which is the point. Any further lifecycle transition — cancelling,
for one, which M4 did not build — gets its own route rather than a `status`
argument.

---

## 2026-09-01 — An event's accent is assigned by the server

Context: `EventRecord.accent` is required, so creation had to produce one, and the
obvious move was to let the host pick.

Decision: the server derives it when the event is created, and it is not
editable afterwards.

Rationale: an accent is a tint on the board card and date block. It is absent
from [TASKS.md](../TASKS.md) entirely, has no entry in
[lib/labels.ts](../lib/labels.ts) alongside the access modes, statuses and
categories, and the fixtures deliberately give the same category different
accents, so it encodes nothing. Decisively, it is not rendered anywhere on
`/events/[id]`: a host editing there would be choosing a colour whose effect they
cannot see on that screen. Deriving it deterministically keeps the board's
variety without adding a control, or a vocabulary entry, for a decoration.

Consequences: if accent ever gains meaning, that is the point at which it earns a
picker and a place in the product's vocabulary — not before.

---

## 2026-09-01 — Host edits never destroy a registration; deleting deliberately does

Context: [TASKS.md](../TASKS.md) §6 raises two of these without settling them —
what happens to the invite list and to existing attendees when access changes,
and what deleting an event with registrations should do. Reducing capacity below
the number already confirmed is a third, unmentioned case.

Decision: editing leaves registration rows alone. Switching away from `invite`
keeps `invitedUserIds`; switching *to* `invite` keeps every row while removing
visibility for people not on the list; lowering capacity below the `going` count
is allowed and evicts nobody, the event simply reading as full. Deleting is the
exception, and it removes the event's registrations through
`db.events.remove()` — so the UI puts a confirmation in front of it that says how
many confirmed places and pending requests go with it.

Rationale: silently cancelling somebody's confirmed place is a worse outcome than
an over-subscribed number or a temporarily invisible event, and none of these
edits is *asking* to remove anyone. Deletion is the one action whose stated
purpose is removal, so there the destruction is honest and the dialog's job is to
name it — a confirmation that undercounts what is lost is a formality rather than
a safeguard. The invite-only case is the one the 2026-08-26 entry predicted:
`not_invited` becomes reachable when a host changes access under people who are
already registered.

Consequences: a row can outlive the viewer's ability to see its event, and
re-inviting the person restores it. M5 will meet the same principle from the
other side when it decides requests, and should not assume the person behind a
pending row can still see the event they requested a place at.

---

## 2026-09-06 — The request decision is a fourth rule, returning a four-state union

Context: M5 had to answer "may this host approve or reject this request", and
that answer was needed twice — once to render the queue's buttons, once to
enforce the write. It could have lived in the queue component with the routes
re-deriving it, in each route handler, or alongside the three existing questions
in [lib/permissions.ts](../lib/permissions.ts).

Decision: `getRequestDecisionAvailability()` joined the shared rules layer, and
returns a union with four states — both decisions available, approve only,
reject only, or neither with a reason. Two exported predicates read the answer,
and the queue and both routes decide through them rather than matching on the
state themselves — the reject route additionally inspects the state to pick its
refusal wording, because capacity is never why a rejection is unavailable and
must not become the reason given for one. The function takes no user, and reads
the registration row rather than the event's access mode.

Rationale: this is the 2026-08-24 and 2026-08-26 entries applied a third time —
a rule with one home cannot let a screen offer something the API refuses. The
union shape needed more care than `RegistrationAvailability`'s, because
approving and rejecting close for *different* reasons: "full, so reject only"
and "already rejected, so approve only" are real states rather than
contradictions, and a pair of booleans would have lost the reason. Taking no
user keeps the refusal unambiguous — manageability already answers whether the
actor may act, so folding them together would give one rule two ways to say no.
Reading the row rather than the access mode is what stops a request becoming
undecidable when a host switches an `approval` event to `open` or `invite`;
keying on access would have stranded those rows forever, with `pendingCount`
reporting requests nobody could clear.

Consequences: the predicates are the only place that maps a state onto a
permitted action, so a new state has one place to be handled. The write path
follows the 2026-09-01 entry — two bodyless routes, one per transition, rather
than one endpoint taking a decision — and the roughly twelve lines of
authorise preamble they share were left duplicated rather than extracted, the
same duplication already accepted between the event and publish routes.

---

## 2026-09-06 — A rejected request stays approvable, and approval is the only decision that clears the queue

Context: [TASKS.md](../TASKS.md) §4 says a rejected person "may not re-request —
the host can still approve them from the queue", while §5 describes the queue as
showing *pending* requests. Whether rejected rows belonged in it was genuinely
open, and the answer decided two further things: whether rejecting needs a
confirmation, and what a host can do about somebody already confirmed.

Decision: the queue keeps rejected requests in a group of their own, offering
approval and nothing else. Rejecting has no confirmation dialog. Approving is
the only decision that takes a row out of the queue — a requester withdrawing
also removes theirs — and there is no host action that takes a confirmed place
back.

Rationale: §4 is the authoritative rules section and states the rejected case
outright, and the product had already shipped that promise to users — the note a
rejected person reads says a host can still approve them. A queue of pending
rows only would have contradicted a sentence the app was already displaying.
Because a host can undo a rejection, rejecting is reversible, and a
confirmation in front of a reversible action is ceremony; deletion earns its
dialog by being irreversible, this does not. Rejecting an already-rejected row
is refused rather than re-stamped, since it would change nothing. Removing a
confirmed attendee was deliberately not built: it is not a third decision on a
request but a different capability — attendee management — and inventing it
inside M5 would have meant deciding, with no specification, whether the place is
freed, whether the person may return, and what they are told.

Consequences: `going` is terminal as far as the queue is concerned, and a host
who approves somebody by mistake has no in-product way back. If that is ever
wanted it is a new capability with its own rules, not another button on this
row. See "Deliberately absent" in [s_status.md](s_status.md).

---

## 2026-09-06 — Decisions close with registration, and capacity closes only approving

Context: §4 closes registration on a draft, a cancelled event and one that has
already started, and separately forbids a host to approve past capacity. It says
nothing about whether those closures also stop a host *deciding* a request that
already exists.

Decision: a draft, a cancelled event or one that has started refuses both
decisions, and the queue renders its rows read-only with the reason. Capacity
closes approving alone: a full `approval` event keeps taking requests, keeps
accepting a rejection, and refuses approval — including for a rejected row,
which stays un-approvable until a seat frees.

Rationale: this is the 2026-08-30 withdrawal entry applied to the other side of
the same table. The alternative reading needs a second, decision-specific
closure rule, and then the same question has two implementations that can drift
— which is what the shared rules layer exists to prevent. Giving somebody a
place at an event that is over or cancelled achieves nothing anyway. Capacity is
deliberately asymmetric because it is a constraint on *admitting* people:
refusing a request is exactly what a host of a full event needs to be able to
do, and blocking that would leave the queue unclearable.

Consequences: a request left pending on a cancelled or already-started event can
no longer be decided by anyone, which is the accepted cost — no cleanup
behaviour was added. M5 also met the final-seat race from the host's side and
left it unsolved, as the 2026-08-30 entry anticipated: the check and the write
are still separated by an `await`, and no transaction, lock or version field was
introduced. It remains a named limitation rather than a bug to rediscover.

---

## 2026-09-06 — The queue's data is built only for managers, and a stale requester is flagged rather than resolved

Context: the queue exposes things no ordinary viewer should have — who asked to
come, and what they wrote. Separately, the 2026-09-01 entry predicted that a
registration can outlive its author's ability to see the event, and M5 was the
milestone that had to face it.

Decision: [lib/events.ts](../lib/events.ts) fills the queue's rows only when the
viewer may manage the event, and hands everyone else an empty array. A request
whose author can no longer see the event stays in the queue, stays fully
actionable, and says so on the row; it is not hidden, not auto-rejected, and the
invite list is not touched on their behalf.

Rationale: gating the render would have been enough for the page that exists
today, but not assembling the data at all is a guarantee rather than a habit — a
future caller that forgets to gate has nothing to leak. On the stale requester,
hiding the row would leave `pendingCount` describing requests the host cannot
see, and auto-rejecting would destroy somebody's request as a side effect of an
unrelated edit, which is the exact inversion of this log's 2026-09-01 principle
that host edits never destroy a registration. Adding them to the invite list
instead would be invitation management, a stretch goal, and would quietly widen
who can see the event.

Consequences: an empty `requests` array means "nothing to decide, or not yours
to decide", and `viewerCanManage` is what distinguishes them. Approving somebody
who has lost visibility makes them `going` without restoring their access —
accepted, and stated on the row itself, with re-inviting them the way to fix it.

---

## 2026-09-16 — The UI is Hebrew and RTL; the domain stays English

Context: the board was built in English, left to right. Localizing it raised a
question the brief does not answer — how far the translation goes. Stored
values, the API contract and the query string are all readable text too, and
translating them was a coherent option.

Decision: the translation stops at the display layer.
[app/layout.tsx](../app/layout.tsx) sets `lang="he"` and `dir="rtl"` once, Rubik
becomes the interface font, and [lib/labels.ts](../lib/labels.ts) maps every
domain value to its Hebrew word. Every stored value, union member,
query-parameter value and `ApiError` `code` keeps its English identifier.
Direction-sensitive CSS became logical properties rather than a mirrored
stylesheet, and anything a person wrote is rendered `dir="auto"`.

Rationale: a translated enum would have to change [lib/types.ts](../lib/types.ts),
the store, the permission rules and the API contract at once, so a presentation
change would become a domain change — the opposite of the separation the shared
rules layer exists to keep. It would also make the query string and every rule
bilingual, with no reader better off. Logical properties mean one stylesheet
serves either direction, so the mirroring is done by `dir` rather than
maintained by hand.

Consequences: `/`, `/styleguide` and the fixtures stayed English, which is
deliberate and is why mixed-direction content is the normal case here rather
than an edge case. Hebrew's dual number means counted phrases cannot be
interpolated and go through helpers. [lib/date.ts](../lib/date.ts) keeps the
wording of dates, durations and relative days rather than routing it through
`lib/labels.ts`. The placement rule for `dir="auto"` — on the text run, never on
a layout wrapper — is a convention rather than a decision, and lives in
[a_system.md](a_system.md).

---

## 2026-09-14 — Persistence is SQL Server through hand-written statements, behind the existing store contract

Context: M6 had to replace the in-memory store with a real database without
changing the product's behaviour or its API contracts ([TASKS.md](../TASKS.md)
§5). The organization's target is SQL Server, reached today through an Azure SQL
development database that also accepts every newer construct. The open choices
were the access layer — an ORM, a query builder, or the driver with
hand-written statements — and how much of the existing store contract to keep.

Decision: SQL Server through the `mssql` driver, with every application
statement written by hand under [lib/data/](../lib/data/) — migration DDL has
its own home in `migrations/` — and no ORM. [lib/db.ts](../lib/db.ts) keeps its
role and its contract as the one persistence boundary product code imports; it
holds no SQL itself, and it goes on generating entity ids and record stamps at
runtime. Every timestamp stays application-side; none is generated by the
database. Compatibility with the SQL Server target is an architectural
constraint on what may be written, not an afterthought:
[docs/sql-server-2008r2-compatibility.md](../docs/sql-server-2008r2-compatibility.md)
is the contract, and it is statically enforced.

Rationale: the runtime available cannot prove compatibility, because it accepts
more than the target does — so the guarantee has to be a guard over the SQL we
write, and a guard can only judge statements it can see whole. An ORM would
generate its SQL out of sight of that guard and choose constructs on our behalf.
Keeping the store contract is what let the move happen without redesigning the
product: the domain model and the rules in
[lib/permissions.ts](../lib/permissions.ts) did not change, and the pages and
routes kept their shape. They did still need changes — where concurrency
semantics moved, and where code had relied on the old store's ordering or
behaviour — but those were changes at the boundary, not to the product, and the
driver stayed out of product code.

Consequences: every new query is hand-written, reviewed against the
compatibility contract, and placed where `check:tsql` scans it. The detailed
rules — the feature floor, rejected constructs, object ownership — live in the
compatibility document and are not restated in this log. Later milestones that
need schema changes add migrations rather than altering tables by hand.

---

## 2026-09-14 — Reset is a CLI command; the HTTP reset endpoint was removed

Context: the supplied starter reset the in-memory data through
`POST /api/dev/reset`, guarded only by refusing production builds. Once the data
lived in a shared organizational database, a reset became a destructive
operation against tables that persist, reached with an account holding far more
permission than the project needs. The endpoint could have been reimplemented
against SQL behind a stronger guard, or removed.

Decision: the endpoint was deleted rather than reimplemented, and reset is a
CLI command only. It needs two independent conditions — a non-production
environment, and an explicit opt-in supplied at the moment of the reset — and
the opt-in may not be stored in the local env file.

Rationale: the guard that matters is intent stated at the time of the action,
and a web request cannot state it: anything a request could carry, a page, a
script or a stray `curl` could carry too. The application has no authentication
at all — identity is a persona cookie by design — so there is no boundary behind
which an HTTP reset could safely sit. An opt-in parked in a file would
pre-authorise every future reset and turn the guard into a one-time setup step.
Nothing in the product called the endpoint; every reference to it was prose.

Consequences: restoring the fixtures means running the command deliberately,
with the dev server stopped. Application code must not depend on the
administration tooling, and lint rejects static imports of it from application
code. The workflow itself is in [README.md](../README.md) "The database", not
here.

---

## 2026-09-15 — Capacity is held by a seat-claim protocol; supersedes the accepted final-seat race

Context: the 2026-08-30 entry "The final-seat capacity race is accepted, not
solved" left two registrations able to take the last seat, and expected that in
a real database this would be closed by "a constraint or a transaction". The
2026-09-06 entry "Decisions close with registration, and capacity closes only
approving" recorded that M5 left the same race open for approvals. M6
introduced the database, and a constraint turned out not to be available: "the
`going` count never exceeds capacity" spans rows and two tables, which no
`CHECK` can express.

Decision: capacity correctness is a transaction protocol, implemented once in
[lib/data/seats.ts](../lib/data/seats.ts). At application runtime only its two
operations — claiming a seat and approving a request — may produce `going`.
Each locks the event row, re-reads the event, the `going` count and the
registration inside the transaction, re-runs the existing rule from
[lib/permissions.ts](../lib/permissions.ts), and writes with the status it read
as a compare-and-set predicate before committing. Writes that cannot raise the
count stay compare-and-set transitions that do not take the event-row seat
lock. The store's generic registration writes were narrowed, at the type level,
so they cannot grant a place. **This entry supersedes the 2026-08-30 decision to
accept the race, and the part of the 2026-09-06 entry's consequences that kept
it open;** both are left as written.

Rationale: the 2026-08-30 entry rejected a store-level reservation because it
would push a business rule into the storage layer that `lib/permissions.ts`
exists to keep out. Re-running the same pure function under the lock answers
that objection rather than overriding it — the rule still has one
implementation, now checked twice: once by the route for the message the caller
sees, once inside the transaction for what is true. Nothing is restated in
T-SQL. Re-reading without a lock, the other option that entry rejected, would
still have left a window; the lock is what closes it.

Consequences: a future runtime write that sets `going` outside `seats.ts`
breaks the invariant, and nothing in the database will catch it — the protocol,
not a constraint, is the guarantee, which [a_system.md](a_system.md) states as a
boundary. An application transaction that locks both an event and rows that
reference it acquires the event side first, so lock order is deterministic;
writes that never touch the event row, such as withdrawing, are unaffected. Seat
claims for one event serialize. A host lowering capacity below attendance is
still allowed and still evicts nobody, so an over-capacity event remains
possible; what the protocol prevents is a seat-taking write adding to it.

---

## 2026-09-28 — Cancelling is a terminal `published → cancelled` transition, open only before the event starts

Context: M7 asked for cancellation as a lifecycle transition separate from
deletion, and the 2026-09-01 entry "Content, lifecycle and ownership are
separate write paths" had already settled that it gets its own route.
[TASKS.md](../TASKS.md) §4 closes registration on a `cancelled` event but does
not say when an event may be cancelled, or whether cancelling can be undone.

Decision: hosts and admins — `canManageEvent()` — may cancel a published event
that has not started yet, and nothing else. Whether the event may be cancelled
is its own rule, `getCancellationAvailability()` in
[lib/permissions.ts](../lib/permissions.ts); it takes no user, and the route and
the detail page both call it. The transition is terminal: there is no restore,
and nothing moves an event out of `cancelled`. A cancelled event stays editable
and deletable, and because `PATCH` cannot reach `status`, editing it — its
`startsAt` included — never restores it.

Rationale: a draft has no audience that could be told it was cancelled, and
deleting it is the honest action; an event that has started has nothing left to
call off. Terminal avoids inventing restore semantics before anything needs
them — what reopens, and against which capacity. Keeping availability apart from
manageability follows the 2026-09-06 entry on request decisions: whether this
person may act and whether this event can be acted on are two answers, so a
refusal has one reason.

Consequences: restoring a cancelled event would be a new transition and route,
and an entry superseding this one. The compare-and-set on `published` guards the
transition, so two cancels of one event cannot both succeed; the start-time
check runs before the write, against the application clock, on what the request
read. No cancellation-specific locked transaction was added for the narrow case
where the start passes, or a concurrent edit moves `startsAt`, between that
check and the write: the result — a cancelled event with a past `startsAt` — is
already a valid state, because a cancelled event may be edited to any date. It
is not a defect to fix. Cancelling takes no seat lock; a seat claim that locks
the row afterwards re-reads `cancelled` and refuses.

---

## 2026-09-28 — Cancelling rewrites no registration; the event's status closes everything

Context: M7 required deciding what happens to existing registrations when an
event is cancelled. The options were to delete them, to set every one to the
registration status `cancelled`, or to leave them as they were.

Decision: cancelling writes the event row and nothing else. Every registration
keeps its status as a factual record of who was going, waiting or turned down.
The event's `cancelled` status is what closes registering, withdrawing,
approving and rejecting, through `getRegistrationAvailability()` and
`getRequestDecisionAvailability()`, which already closed on it — no new rule was
written. No cancellation metadata was added, and M7 needed no schema change or
migration.

Rationale: a `cancelled` registration already means that the person withdrew
([d_glossary.md](d_glossary.md)). Setting every row to it would make "they
withdrew" and "the event was called off" indistinguishable on the row, and lose
who had actually been coming. Deleting would lose that record for good, and
deletion is already the one event action whose purpose is removal — the
2026-09-01 entry "Host edits never destroy a registration; deleting deliberately
does". Reusing the existing closures keeps one implementation of each rule, as
the 2026-08-30 entry on withdrawal intended.

Consequences: a cancelled event keeps its `going` count, which the screens show
as a fact rather than as availability. Its `going` rows cannot be withdrawn and
its pending requests cannot be decided — the consequences the 2026-08-30 and
2026-09-06 entries named, now reachable through the product. Deleting a
cancelled event still removes its registrations. Recording who cancelled, when
or why would need a migration and a decision of its own.

---

## 2026-09-30 — Removing is its own `removed` status, and the current access mode decides the way back

Context: M8 asked hosts and admins to be able to take back a confirmed place,
as a capability separate from rejecting a request, and to decide what state
results and whether the person may return. The 2026-09-06 entry "A rejected
request stays approvable, and approval is the only decision that clears the
queue" had deliberately left this unbuilt, noting that a host who approves
somebody by mistake had no in-product way back.

Decision: removing moves a `going` registration to a new status, `removed`,
added to the schema by `migrations/0002_add_removed_registration_status.sql`,
which re-creates the status `CHECK` under its existing name. A host may restore
a removed attendee, `removed → going`. While the event's access is `approval`
or `invite`, a removed person may not register again on their own —
`getRegistrationAvailability()` answers `removed` — so restoring is the only way
back. On an `open` event both removing and restoring are closed, and a removed
person registers again through the ordinary flow under its ordinary closures.
Both actions close on a draft, a cancelled event and one that has started.

Rationale: `cancelled` already means the person withdrew
([d_glossary.md](d_glossary.md)), and it lets them register again. `rejected`
belongs to request decisions and would put the row in the approval queue.
Deleting the row is ruled out by the 2026-08-30 entry "One registration row per
person and event, transitioned rather than replaced". A value of its own keeps
each meaning on the row, and lets self-registration be refused in one place. An
`open` event admits anyone, so a host has no say over who attends it; letting
the current mode decide gives each mode exactly one way back.

Consequences: the 2026-09-06 entry stands for the queue — `going` is still
terminal there — but a confirmed place on an `approval` or `invite` event now
has an in-product way back, through the attendee list rather than the queue.
Switching an event to `open` changes what a removed row allows: the person may
then register again on their own. Migration 0002 is the first schema change
since M6, and `0001` was not edited.

---

## 2026-09-30 — A manager's place is not removable, and removing never touches an invitation

Context: removing raised two questions the specification does not answer:
whether a host may remove somebody who may manage the event themselves, and
what removing does to that person's invitation on an invite-only event.

Decision: `getAttendeeRemovalAvailability()` takes the target as well as the
row, and refuses when the target may manage the event — the caller, another
host or an admin alike. The route answers that with a 409, not a 403: the
caller may remove people, just not this one. Removing and restoring write the
registration row alone; the invite list is never changed. Restoring therefore
gives a place, not visibility, and a removed person who has lost sight of the
event — after an access change — is flagged on their row (`attendeeCanView`)
and stays restorable. The host's rows are built by
[lib/events.ts](../lib/events.ts) only for a viewer who may manage the event.

Rationale: somebody who may manage the event steps back out by withdrawing,
through the same flow as any other participant, rather than through attendee
removal — and that includes a host removing themselves. An invitation is a
separate relationship from a registration — the 2026-09-01 entry already keeps
the two independent across edits — and M8 deliberately left invitations alone,
revoking none on removal. Flagging rather than resolving a lost-visibility
row, and building the data only for managers, are the 2026-09-06 entry "The
queue's data is built only for managers, and a stale requester is flagged rather
than resolved" applied to the attendee list.

Consequences: a removed attendee on an invite-only event still sees the event,
and sees that they were removed. Changing who is invited — including fixing a
restored person who cannot see the event — is left to M9, invitation
management.

---

## 2026-09-30 — Restoring is a seat claim that resumes the removed cycle; removing is a lock-free compare-and-set

Context: one of the two new transitions lowers the `going` count and the other
raises it, and the 2026-09-15 entry "Capacity is held by a seat-claim protocol;
supersedes the accepted final-seat race" requires every write that can raise it
to go through [lib/data/seats.ts](../lib/data/seats.ts). Separately, a
registration carries the previous request's `message`, `decidedBy` and
`decidedAt`, and each transition had to decide what to do with them.

Decision: removing is an expected-status write from `going` with no event-row
seat lock, like withdrawing and rejecting. Restoring is the third seat claim,
beside registering and approving: `db.registrations.restore` locks the event
row, re-counts, re-runs `getAttendeeRestoreAvailability()` and writes only if
the row is still `removed`. Both change the status and refresh `updatedAt`, and
leave `message`, `decidedBy` and `decidedAt` as they were, so a restored person
returns to the cycle they were removed from with its record intact. A removed
person registering again on an `open` event goes through `claimSeat` instead,
which treats the row as revived and starts a new cycle.
Removing asks for confirmation; restoring does not.

Rationale: an operation that can only free a seat cannot overfill an event, so
it needs no lock; the compare-and-set is what stops it acting on a row that
moved. Restoring can take the last seat, so it is held to the same protocol and
re-runs the same rule the route ran. Restoring undoes a removal — the request
that got the person in was already decided — whereas registering again is the
person asking afresh, which is what the 2026-08-30 entry means by a new cycle.
Removing earns a confirmation because undoing it depends on a seat still being
free when the host changes their mind. Restoring
has none, consistent with the 2026-09-06 entry's view that a confirmation in
front of a reversible action is ceremony.

Consequences: three paths now produce `going` — `claimSeat`, `approve` and
`restore` — and `RegistrationUpdate` still cannot express it. Nothing records
who removed someone, when or why, beyond the row's `updatedAt`.

---

## 2026-10-05 — An invitation grants visibility only; revoking leaves the registration as it is

Context: M9 asked hosts and admins to invite people and revoke invitations, and
to decide what revoking does to an existing registration, whatever its status.
Three earlier entries had already pointed here: the 2026-09-01 entry "Host edits
never destroy a registration; deleting deliberately does" and the 2026-09-06
entry "The queue's data is built only for managers, and a stale requester is
flagged rather than resolved" named re-inviting as the fix for a person who
lost sight of an event, and the 2026-09-30 entry "A manager's place is not
removable, and removing never touches an invitation" left changing who is
invited to M9.

Decision: inviting writes the invite row and nothing else — no registration is
created, and the person registers through the ordinary flow like anyone else
who can see the event. Revoking deletes the invite row and nothing else: the
person's registration keeps whatever status it had, and a `going` place keeps
counting against capacity. Capacity plays no part in either action. A confirmed
attendee who can no longer see the event is flagged on the host's attendee list
(`attendeeCanView`, now carried by `going` rows as well as `removed` ones); the
mismatch is shown, not resolved.

Rationale: an invitation answers "may this person see the event", a
registration answers "where does this person stand at it", and the 2026-09-01
entry already keeps the two independent across edits. Cancelling or removing
somebody's place as a side effect of revoking would turn revoking into a second,
unsignalled removal, when removal is its own capability with its own rule and
its own confirmation. Flagging rather than resolving is the 2026-09-06 stance,
applied to the attendee list's `going` rows.

Consequences: the trade-off is a person who holds a place at an event they
cannot see. They keep their seat and it counts; they cannot withdraw on their
own, because the registrations route answers an event they may not see with a
404. While the event has neither started nor been cancelled, a host can still
free the seat — by removing them, or by giving their sight of the event back
(re-inviting them, or moving the event off `invite`) so they can withdraw.
Once the event has started or been
cancelled, withdrawing, removing and inviting are all closed while revoking
stays open, so nothing short of deleting the event frees the place. Accepted
and named, not solved. The fix the earlier
entries predicted now exists: inviting a removed or restored person who lost
sight of the event gives their access back, while inviting is open.

---

## 2026-10-05 — Who may be invited, and when the invite list may change

Context: the specification left open who may be invited, and whether the list
may be managed while access is not `invite`, or while the event is a draft,
cancelled or has started.

Decision: any existing user who may not manage the event may be invited;
someone who may — a host, a co-host or an admin — is refused as a target, and
someone already on the list cannot be added twice. The list changes only while
the event's access is `invite`. On any other access it is **dormant**: its rows
are kept exactly as they were, read-only — neither inviting nor revoking is
open — and they count again if the event goes back to `invite`. Inviting is
open on a draft and closes once the event is cancelled or has started.
Revoking ignores the lifecycle: it stays open on a cancelled event and on one
that has started. The rules are `getInvitationListAvailability()`,
`getInvitationAvailability()` and `getInvitationRevocationAvailability()` in
[lib/permissions.ts](../lib/permissions.ts).

Rationale: a manager already sees the event, and the 2026-08-26 entry "Invite-only
registration admits invited users or managers" already lets them register
without being on the list, so inviting them would mean nothing. A list on an
event that is not invite-only decides nothing; keeping it untouched is what lets
switching back to `invite` restore the access it described, which the 2026-09-01
entry's "switching away from `invite` keeps `invitedUserIds`" anticipated. A
draft is invisible to invitees anyway, so building its list there widens nothing
until it is published. Inviting someone to a cancelled or started event only
shows them something they can no longer join; revoking only narrows who can see
the event, and a host may still need to take access to a confidential event back
afterwards.

Consequences: a dormant list cannot be pruned until the event is invite-only
again. An invitation revoked after the event started or was cancelled cannot be
given back, and the revoke confirmation says so in that case. Inviting happens
on the detail page only, never as part of creating an event.

---

## 2026-10-05 — Invitations are written one person at a time under the event-row lock; inviting several is a sequence of those writes

Context: an event's invite list was only ever written whole — on create, on
delete, and through `db.events.update`, which replaces the list when a patch
names it. M9 also had to keep a change to the list safe against a concurrent
registration: the seat protocol locks the event row, but the invite rows are
read by a separate statement that the lock does not itself cover.

Decision: each change is one `(event, person)` row, addressed by that pair —
`POST` and `DELETE` on `/api/events/[id]/invitations/[userId]`, with no body and
`[userId]` as the target, never the actor. `db.events.invite` and
`db.events.revokeInvitation` lock the event row with the seat claim's own
statement, read the event and its invite list under that lock, re-run the same
rule the route ran, and write one row. They are not seat claims: they write no
registration and read no count. A duplicate key on the invite row is answered
as "already invited", and a revoke that deletes nothing as "not invited". The
whole-list replacement in `db.events.update` is not used. Inviting several
people at once is a picker in the UI that sends one such request per person,
in sequence, best effort: a refusal for one does not stop or undo the others,
and one summary reports how many went through.

Rationale: replacing the whole list would let two hosts overwrite each other's
changes. Sharing the event-row lock is what closes the concurrency question: a
seat claim holds that lock while it reads the invite list, and every invitation
write must take the same lock first, so the list a claim decides on cannot
change before it commits. Per-person requests keep one authorisation path and
one rule check for every person, whether one is invited or ten; sequential
rather than parallel, because the requests would queue on the same row lock
anyway.

Consequences: inviting several people costs one round trip each and is not
atomic — a partial success is a normal outcome, reported as one. Invitation
writes serialize with seat claims on the same event. An invitation row carries
no id and no timestamp, so nothing records who invited whom or when, and
nothing notifies the person. No schema change was needed.

---

## 2026-10-05 — The invite list is built only for managers, an invitee included

Context: the list says who else was asked to a confidential event, and the
specification left open whether invitees can see each other.

Decision: [lib/events.ts](../lib/events.ts) builds the detail screen's
`invitations` only when the viewer may manage the event, and leaves it `null`
for everyone else, an invitee included. The people who may be added are worked
out there too, by the same rule the route runs, so the screen derives nothing
and offers nobody the server would refuse — though the route re-checks
regardless.

Rationale: this is the 2026-09-06 entry "The queue's data is built only for
managers, and a stale requester is flagged rather than resolved" applied to the
invite list: data that is never assembled cannot leak through a caller that
forgets to gate it. It is `null` rather than the queue's empty array because an
empty list means something to a host — it is where inviting starts — so "not
yours" and "nobody yet" must be told apart.

Consequences: invitees cannot see who else is invited. What an ordinary viewer
of an invite-only event sees is unchanged — the event and who is going, nothing
about the list.

---

## 2026-10-20 — A share link is the event's canonical URL and grants nothing

Context: [TASKS.md](../TASKS.md) M10 left open whether a share link uses the
event id, a token, a slug or a separate record, how holding one interacts with
visibility, and whether links can be revoked or regenerated.

Decision: the share link is the event's own page, `/events/[id]`, on the
configured origin, built only by `buildEventShareUrl()` in
[lib/shareLinks.ts](../lib/shareLinks.ts). No token, no slug, no record and no
schema change. Opening it is answered by `canViewEvent()` exactly as typing the
address would be.

Rationale: a link that grants nothing cannot weaken invite-only visibility, which
M10 required — an invite-only event stays a 404 for anyone not on its list, and
registration reached through the link obeys every ordinary rule because it *is*
the ordinary page. A token or a record would have been something else to store,
revoke and regenerate, with no access of its own to justify it. The reasoning is
in the header of [lib/shareLinks.ts](../lib/shareLinks.ts).

Consequences: there is nothing to revoke or regenerate; changing who can see the
event is the access mode and the invite list, as before. A member who copies the
address bar has the same URL with the same access, so the copy action is not an
authorisation boundary. Sharing cannot admit anyone who cannot already see the
event.

---

## 2026-10-20 — Absolute links come from `EVENTS_APP_BASE_URL`, never the request

Context: a share link is absolute — it is copied or mailed somewhere else — so
the application needs its own origin, and a request's `Host` header is whatever
the caller sent.

Decision: `buildEventShareUrl()` reads the server-only `EVENTS_APP_BASE_URL` and
accepts only a bare `http`/`https` origin. When it is missing or unusable the
result is `null` rather than a throw: the detail page shows that sharing is
unavailable and the share-email route answers 503. Nothing falls back to the
request's own host.

Rationale: a URL built from `Host` and mailed under the product's name would carry
an attacker's hostname. Sharing is one optional host tool, unlike the database,
which every page needs — so a missing value should cost the host that tool, not
the whole detail page. See the header of [lib/shareLinks.ts](../lib/shareLinks.ts)
and [.env.example](../.env.example).

Consequences: moving the deployment means changing one variable. Every
deployment that offers sharing has to set it.

---

## 2026-10-20 — Email goes only to people who can already see the event, and sharing has its own lifecycle rule

Context: M10 added emailing the link. Who may receive it, and when sharing is
offered at all, were not covered by [TASKS.md](../TASKS.md) §4.

Decision: the recipients are every user `canViewEvent()` admits, minus the
sender, built by [lib/events.ts](../lib/events.ts) as `shareRecipients` only for
a viewer who may manage the event and `null` for everyone else. The route asks
every question again before it sends. `getSharingAvailability()` in
[lib/permissions.ts](../lib/permissions.ts) closes sharing on a draft, a
cancelled event and one that has started, and takes only the event; who may
share is `canManageEvent()`. It is a separate function from
`getCancellationAvailability()`, although the two give the same answer today.

Rationale: the email grants nothing, so sending it to someone who cannot see the
event would only lead them to a 404. A draft is invisible to every recipient,
and a cancelled or started event is closed to registration, so there is nothing
worth sending.
Built only for managers for the reason of the 2026-10-05 entry "The invite list
is built only for managers, an invitee included". Sharing and cancelling are
different questions that happen to agree; one changing should not quietly
change the other.

Consequences: sharing is not a way to invite. On an invite-only event, getting
someone the link means inviting them first (M9). Moving a published event's
start back into the future makes it shareable again.

---

## 2026-10-20 — Email uses the organization's transport and template conventions, behind a route handler, one recipient per request

Context: the organization has a reference email implementation — a transport, a
template shell for Outlook 2016 and a sender identity — which reached its sends
through a Server Action. This repository's convention is route handlers. The
organizational sender values were not known.

Decision: the transport, template shell, palette and image convention are
adopted from the reference, with the deliberate differences recorded in the
headers of [lib/services/emailService.ts](../lib/services/emailService.ts),
[emails/BaseEmail/](../emails/BaseEmail/) and
[scripts/base64convertor.mts](../scripts/base64convertor.mts); the entry point
is a route handler, `POST /api/events/[id]/share-emails/[userId]`, with no
body. The sender is the Events Board system, configured through
`EVENTS_MAIL_SENDER_NAME`, `EVENTS_MAIL_SENDER_EMAIL` and
`EVENTS_MAIL_SYSTEM_ID` with no default; the host is named only in the text.
One recipient per request, sent in sequence, best effort, with no automatic
retry. Clients receive only short, fixed messages.

Rationale: the Server Action was how the reference was called, not part of its
email convention, and a route handler keeps the authorisation boundary one
obvious layer, as [CLAUDE.md](../CLAUDE.md) requires. Per-person requests are the
2026-10-05 invitation pattern: each send is authorised on its own and each result
maps to one person. No retry, because a send that timed out may still have been
delivered. Configuration rather than values written into the code, because the
organization assigns them and they were not yet known; and no default, so an
unconfigured server refuses rather than sending under an identity that is not
its own. Fixed messages, because the mail service's response is not the
client's to see. The details are in the headers of the route and
[lib/services/emailService.ts](../lib/services/emailService.ts).

Consequences: a batch can partly succeed, and is reported that way. Sending is
refused as "not configured" until all four mail variables are present and pass
`sendMail()`'s checks: each is non-empty, the sender address is a plausible
email address, and the system id is a whole number. Nothing checks that
`MAIL_SERVICE_URL` is a well-formed URL. The email templates are the one place
outside the app's styling rules — see [CLAUDE.md](../CLAUDE.md). Real delivery
and Outlook rendering are unverified; see [s_status.md](s_status.md).

---

## 2026-10-22 — The workshop pages are retired, and `/` redirects to the board

Context: two pages had outlived the workshop the repository started as — the
English "Start here" page at `/`, describing what was supplied and what was left
to build, and `/styleguide`, rendering the component kit with hand-written
props. Neither was part of the product. M11 will redesign the interface against
an external Style Guide, and later pre-M11 branches change the props and
meaning of components `/styleguide` rendered. The options were to keep the
pages, translate them, or retire them; and, for `/`, to render the board there,
redirect, or leave it a 404.

Decision: both pages are deleted. `/` keeps a page, `app/page.tsx`, whose only
job is `redirect("/events")`, a temporary (307) redirect. The top bar's brand
link points to `/events`, and its nav keeps one entry, the board. The components
and types that no page uses once `/styleguide` is gone — `SegmentedControl`,
`Spinner`, `Radio`, `CardFooter` and `BadgeVariant` — are kept.

Rationale: keeping or translating the pages meant maintaining a description of
a finished workshop and mirroring every later component change into a page the
external Style Guide replaces, development use included. A redirect keeps the
board at a single canonical URL, `/events`, where rendering it at `/` too would
give it two; and `/` is the address people type, so it should not be a 404. A
308 is cached by browsers indefinitely, so if M11 ever gives `/` a page of its
own, anyone who had seen the redirect would never reach it; a 307 costs the
same single extra request without that risk. The redirect lives in
`app/page.tsx` rather than in a `next.config` `redirects()` or a proxy because
every other route is decided under `app/`, and the project has neither of the
others — adding one for a single path would create a second place routes are
defined. Its cost is that the root layout still runs, reading the session and
the persona list, before the redirect is sent; that is negligible. The unused
components stay because removing pages is not a decision about the kit: whether
each is kept, adapted, replaced or removed depends on the Style Guide, and
[TASKS.md](../TASKS.md) §5 "M11 — System redesign" records that review.

Consequences: there is no in-app page that renders every component; the
`components/` directories are the reference until the Style Guide arrives, as
[CLAUDE.md](../CLAUDE.md) says. Some kit exports are now rendered by no page —
intended, until M11. `/styleguide` answers 404. The 2026-09-16 entry "The UI is
Hebrew and RTL; the domain stays English" notes that `/` and `/styleguide`
stayed English; that part no longer describes the app, but the seeded fixtures
are still English, so mixed-direction content remains the normal case.

---

## 2026-10-22 — The top bar has no separate nav; the brand is its only link

Context: the entry above, "The workshop pages are retired, and `/` redirects to
the board", left the top bar's nav with one entry, the board. That entry and the
brand beside it now led to the same place, `/events`.

Decision: the nav is removed. The brand — the "E" mark and the product name — is
the top bar's only link, to `/events`. `NavLink`, the client component that
highlighted the current nav entry, its styles in `AppShell.module.css`, and the
two labels only the nav used are deleted; the brand takes over the nav's job of
pushing the persona switcher to the far end of the bar. This refines the entry
above, which said the nav keeps one entry.

Rationale: two links to one destination, side by side, are one link too many,
and a nav with a single entry has nothing to navigate between. `NavLink` is
deleted rather than kept, unlike the kit components that entry retained,
because it is app-frame code with no other consumer, not part of the
`components/ui/` kit whose future M11 decides.

Consequences: the top bar has no navigation landmark and no active-route
highlight. If a second top-level destination is added, the nav comes back with
it — whether as a restored `NavLink` or in whatever form the M11 redesign sets.

---

## 2026-10-25 — A rejected person may register again on an `open` event, and is told why

Context: the 2026-09-06 entry "A rejected request stays approvable, and
approval is the only decision that clears the queue" applied
[TASKS.md](../TASKS.md) §4 — a rejected person "may not re-request" — on every
access mode. On an `open` event that left someone locked out of an event that
admits anyone, while a removed person in the same position could already come
back (the 2026-09-30 entry "Removing is its own `removed` status, and the
current access mode decides the way back"). Change 9 of the pre-M11
stabilization asked for the same exception for `rejected`.

Decision: `getRegistrationAvailability()` closes a `rejected` row only while
the event's access is not `open`. On an `open` event the row falls through to
the ordinary checks — capacity included — and registering revives it through
`claimSeat` as a new cycle: `rejected → going` on the same row, with the
previous message and decision fields cleared. On `approval` and `invite` it
stays closed, and a host may still approve it from the queue on any access
mode. Changing the access mode registers nobody. The registration panel keeps
the "לא אושר" badge and the normal register action, and replaces the normal
note with one that explains the event is now open, as `REMOVED_REOPENED_NOTE`
does for a removed person; the board card shows the badge alone.

Rationale: the refusal exists so a person cannot override a host's decision
about who gets in, and an `open` event has no such decision — the same
reasoning as the removed exception, so the two now read alike. Reusing
`claimSeat` keeps one row per person and event and keeps the seat protocol the
only path to `going`. The badge is kept because it is the person's true status
until they register; the note is what stops it contradicting the button. The
history was not preserved separately: a revived row is a new cycle everywhere
else, and nothing in the product reads the old decision once it is overtaken.

Consequences: if the person registers and the event later returns to
`approval`, nothing remembers the rejection — after withdrawing they may request
again. A host approving the row while the person registers is two seat claims
on the same event lock: whichever runs second re-reads the row as `going` and
its rule refuses it, so the loser gets a 409 through that refusal ("already
registered" for the person, "nothing left to decide" for the host), not through
the stale-write outcome. This refines the 2026-09-06 entry; it does not
supersede it.

---

## 2026-10-25 — An event's dates lock once it has started or been cancelled, and a new start must be in the future

Context: changes 5 and 8 of the pre-M11 stabilization asked that no event be
scheduled in the past and that an event which has happened or been called off
keep its dates. Until then the only date rule was end-after-start, so a host
could create an event in the past, publish a past-dated draft, and move a
started or cancelled event anywhere. The 2026-09-28 entry "Cancelling is a
terminal `published → cancelled` transition, open only before the event starts"
had recorded, as a consequence, that "a cancelled event may be edited to any
date".

Decision: one pure rule, `checkEventSchedule()` in
[lib/permissions.ts](../lib/permissions.ts), takes the stored event (or `null`
on create), the dates that would be written and the server's `now`. A date that
changes is judged; one that does not is never refused. A start that changes must
be strictly later than now. A published event that has started and a cancelled
one, at any date, refuse any change to either date — `getScheduleAvailability()`
answers which, and the detail page uses it to disable the form's date inputs.
The create and edit routes run the rule after parsing and answer a 400 with field
errors; publishing a draft whose start has passed is a 409. It is **not** in
`parseEventForm`: a `PATCH` fills omitted fields from the stored event, so a
"future start" check there would refuse every edit of a started event.

`parseEventBody` keeps the stored value when a `PATCH` sends a date in the same
minute as the stored one, for both dates and on every event, before the
existing end-after-start check runs. The form omits locked dates entirely, so
the stored ones stand. `RequestError` now carries the response's `details`, and
the form shows the server's field errors next to their fields.

Rationale: whether a date may change is a lifecycle question, so it sits with
the other availability rules rather than in the input parser, which stays about
well-formedness. Taking `now` as a parameter gives one clock reading per request
and keeps the rule testable; "started" is still the comparison `isPast` makes.
The same-minute rule exists because the form can only express whole minutes
while `datetime2(3)` keeps seconds, so an untouched date comes back slightly
different. Calling that "unchanged" is only safe if the stored value is also
what is written — otherwise a request could move a locked date by seconds while
the rule saw no change — and swapping it in before parsing means end-after-start
is checked against what is actually stored. A cancelled event keeps its dates
because its record is what people were told; moving them changes nothing for
anyone and only makes the record wrong.

Consequences: this supersedes the "a cancelled event may be edited to any date"
consequence of the 2026-09-28 entry; the rest of that entry stands. An event
that has started can no longer be made cancellable or shareable again by moving
its start. No API caller can change a stored date by less than a minute, on any
event. A draft whose start passes stays editable and is published only after its
start is moved. An event that starts between the page loading and the save is
decided by the server's clock, last write wins. The form's `datetime-local`
values are still produced in the server's time zone and read in the browser's;
omitting locked dates keeps that pre-existing mismatch from refusing ordinary
edits of a started event, but the mismatch itself is not fixed.

---

## 2026-10-26 — Deleting an event is soft: the row is stamped and hidden from every reader, and nothing it owns is removed

Context: change 3 of the pre-M11 stabilization asked that deleting an event
keep its data. Until then `removeEvent` deleted the event's registrations,
co-hosts and invitations and then the event row, which the 2026-09-01 entry
"Host edits never destroy a registration; deleting deliberately does" had
chosen. The options were a soft-delete column, a new `deleted` status, or
moving deleted events elsewhere; and, for visibility, hiding a deleted event
from everyone or keeping it visible to admins.

Decision: migration `0003` adds `dbo.Events_Events.DeletedAt datetime2(3)
NULL`. Deleting locks the event row and stamps `DeletedAt` and `UpdatedAt` from
the application's clock, only while `DeletedAt IS NULL`; it removes no row from
any table. Every statement that reads an event row — the board list, the
single read, the seat claim's locked read and the bare lock — filters
`DeletedAt IS NULL`, so a deleted event is nonexistent to every reader, admins
included: absent from the board, a 404 on its page and on every route, and
`gone` to the seat protocol and the invitation writes. `DeletedAt` does not
reach `EventRecord`, and there is no new status. Event updates require
`DeletedAt IS NULL`; when edit, publish or cancel affect no row, the route
re-reads the event through the ordinary filtered read (`eventExists`) and
answers 404 if it is gone and the existing 409 if its status moved. There is
no restore, no admin view, no retention period and no purge.

Rationale: a column filtered at the data layer is the smallest change that
makes a deleted event disappear everywhere at once — pages and routes keep the
404 they already give a missing event, and nothing above `lib/data/` had to
learn a new state. A status would have put "deleted" into every rule in
`lib/permissions.ts` and into the domain type, for an event nobody may see.
Hiding it from admins too keeps one answer for "does this event exist", and an
admin view was not asked for. Deleted is 404 rather than 409 because, to the
caller, the event no longer exists — the same answer whether it was deleted
before their request or during it.

Consequences: this supersedes the deletion half of the 2026-09-01 entry —
deleting no longer destroys registrations; it takes them out of reach with the
event. The delete confirmation's wording, which names the places and requests
lost, stays true from the user's side and is unchanged. Child rows of deleted
events accumulate; a development reset still hard-deletes everything. **Every
future event read must include `DeletedAt IS NULL`**, or it leaks deleted
events. The 2026-10-05 consequence that "nothing short of deleting the event
frees the place" of a revoked invitee on a started or cancelled event now reads
as: nothing frees it; deleting takes it out of reach. Code from before C5,
running against a database that has `0003`, still sees deleted events — the
shared DEV database is one such case.

---

## 2026-10-26 — Withdraw, reject and remove take the event-row lock first; a same-statement parent check alone failed on Azure SQL

Context: once deletion is soft, an event's registrations outlive it, so a
withdraw, reject or remove that read a live event could write its row after the
event was deleted and answer 200 for an event that no longer exists. Hard
deletion had hidden this by removing the row. The approved plan kept these
three writes lock-free — single `UPDATE` statements with the expected-status
compare-and-set plus an `EXISTS` on a live parent event — on the reasoning that
under row versioning a write that does not see an uncommitted delete is simply
ordered before it. It named a locked transaction as the fallback if testing
disproved that.

Testing on Azure SQL DEV disproved it. That database runs
`READ_COMMITTED_SNAPSHOT` and optimized locking. When the registration `UPDATE`
had to wait on its target row — another writer holding it — and the delete
committed during the wait, the update resumed and wrote the row: 200, after the
delete. With optimized locking the `EXISTS` is evaluated when the row is
qualified, before the wait, and is not re-evaluated afterwards unless the target
row itself changed. Reproduced through the API for all three writes, and
directly in SQL. A `READCOMMITTEDLOCK` hint on the `EXISTS` was tried as an
experiment: it made the write wait for a delete still in flight, but still
wrote after one that committed during the wait, so it was not a fix.

Decision: `transitionRegistration` in
[lib/data/registrations.ts](../lib/data/registrations.ts) runs each of the
three as a short transaction that first takes the event-row lock — `lockEvent`,
the existing filtered `LOCK_EVENT` with `UPDLOCK, ROWLOCK`, the same lock the
seat claim and the soft delete take — and then makes the unchanged
compare-and-set update. No live event to lock: nothing is written, `gone`, 404.
Row no longer in the expected status: `stale`, 409. Otherwise the existing
success response. The `EXISTS` stays in the update as a second line of defence
for any future caller that forgets the lock. The pool-level registration update
was removed, so every runtime registration write now runs under its event's
lock. Because the transaction already knows which of the two happened, these
routes do not re-read the event afterwards; `eventExists` serves only edit,
publish and cancel.

Rationale: a write that holds the event row cannot be overtaken by a delete,
which needs the same row: either the delete committed first and the lock finds
nothing, or the write locked first and the delete waits for it to commit. That
holds whatever the isolation flavour, because it rests on `UPDLOCK` and lock
order rather than on how a statement's reads are versioned — so it is expected
to behave the same on a stock 2008 R2 as on Azure. It is the seat protocol's
own shape without the count or the rule, and it keeps the documented lock order
— event row first — with no exception, which the lock-free design would have
needed. Verified on Azure SQL DEV: in both orders, for all three writes, with
and without a competing lock on the registration row, the observed blocking
chain showed the delete waiting on the transition or the transition waiting on
the delete, and the outcome was 200-then-delete or 404 with nothing written;
concurrent transitions on a live event still produced exactly one winner and a
409, with no deadlock.

Consequences: withdrawing, rejecting and removing now serialise with seat
claims, invitation writes, edits, lifecycle transitions and deletes of the same
event on its row — more contention than before, briefly, per event. The
statements are short and no measurable effect was seen, but no load test was
run. A future write to registration rows must take the event-row lock first.
The behaviour has been observed only on Azure SQL DEV; it has not been run on a
real SQL Server 2008 R2. This replaces the lock-free design in
[docs/pre-m11-stabilization-plan.md](../docs/pre-m11-stabilization-plan.md) §3
"C5" and §6, which record the change.

---

## 2026-10-28 — Navigation returns as a rail: the board and "new event" as destinations, the persona at the top

Context: the entry "The top bar has no separate nav; the brand is its only
link" (2026-10-22) removed the nav because it held one destination, and said it
would come back if a second one appeared, in whatever form the M11 redesign
set. The approved M11 design gives the frame a navy rail at the inline start,
with the persona at its top and two destinations under it: the board, and
"new event" for whoever may create.

Decision: the top bar is replaced by that rail, a `<nav>` named "ניווט ראשי"
inside it. "New event" is listed only when `canCreateEvent` allows it — the
same rule the board's own button and the route use — so the rail never offers
what the server would refuse. The current destination is marked with
`aria-current="page"` by `RailLink`, the one client leaf the navigation needs;
`AppShell` stays a Server Component. A destination is current on its own path
only: the board is not current on an event's page. Below 760px the rail
becomes a 56px bar with the brand at the start and the persona's avatar at the
end, and the destinations leave it — the board's page header carries "new
event", as it already did. The persona switcher moved onto the shared `Menu`,
which supplies the keyboard model and focus handling; the switching itself is
unchanged. This reverses the 2026-10-22 entry.

Rationale: with "new event" in the frame there are two destinations again,
which is the case that entry left open. Deriving the item from the shared
permission rule keeps the frame, the board and the route in agreement.
Marking the current item in the browser keeps the whole frame server-rendered
apart from that marker.

Consequences: the frame has a navigation landmark again, and `--topbar-height`
is gone; the detail page's sticky panel is offset from the top of the viewport
alone, since nothing sits above the content on a wide screen. On a narrow
screen the navigation is the brand link and the pages' own actions.
