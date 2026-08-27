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

- the async, deep-copying, `globalThis`-backed store →
  [lib/db.ts](../lib/db.ts) header;
- cookie personas instead of authentication →
  [lib/session.ts](../lib/session.ts) header;
- the locale pinned to `en-GB` to avoid hydration mismatch →
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
