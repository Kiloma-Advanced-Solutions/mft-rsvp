# Pre-M11 stabilization plan

> **This is a plan, not implemented functionality.** Nothing described here as
> new behaviour exists in the code until the branch that delivers it is merged.
> Where this document and the code disagree about what *is* built, the code is
> right. Progress is tracked in [memory/s_status.md](../memory/s_status.md), not
> here.
>
> **This document is temporary.** Once all six branches are merged, the last one
> deletes it and removes its references from the Memory Bank, after confirming
> that every rule and decision it introduced is recorded in its authoritative
> home (see §9).

## 1. Purpose and scope

Eleven bug fixes and behaviour changes were requested after M10 and before M11
(system redesign). Nine are delivered before M11 in six focused branches; two
(changes 1 and 2) are deferred into M11 because they depend on the external
Style Guide.

This document records the confirmed requirements, the branch boundaries, the
order, and the technical findings the investigation produced, so each
implementation session can start from them instead of re-investigating.

It does **not** restate the Memory Bank. Rules live in [TASKS.md](../TASKS.md)
§4, conventions in [CLAUDE.md](../CLAUDE.md), rationale in
[memory/dec_log.md](../memory/dec_log.md). When a branch lands, the rules it
introduces move into those homes; this plan is retired once all six branches are
merged.

Planning baseline: `yardenah/events-board` at `dd7ae4c` (merge of PR #39, M10
documentation). Every branch must re-verify its own baseline.

## 2. The eleven changes — confirmed requirements

| # | Change | Confirmed requirement | Delivered by |
| --- | --- | --- | --- |
| 1 | Card colour by category | Each category gets one consistent colour. Palette and mechanism are decided after the external Style Guide is reviewed. Reverses the dec_log entry "An event's accent is assigned by the server" (2026-09-01). | **M11** — authoritative in `TASKS.md` §5 |
| 2 | Redundant explanatory notes | Review during the redesign. Remove purely descriptive notes; keep any message that explains a registration restriction, a permission, or a business state (e.g. the closed-registration notes the API reuses as refusals). Nothing is removed before M11. | **M11** — authoritative in `TASKS.md` §5 |
| 3 | Soft deletion | `DeletedAt datetime2(3) NULL`. A deleted event is inaccessible to everyone, admins included, and is treated as nonexistent by every normal read and operation. No restore, no retention/purge. Registrations, co-hosts and invitations are preserved in the database. | C5 |
| 4 | Remove obsolete pages | `/` (the English "Start here" workshop page) redirects to `/events`. The brand link points to `/events`. `/styleguide` is deleted entirely, with its navigation entry — the external Style Guide replaces it, including for development. Shared UI components and styles still used by the app are kept. | C1 |
| 5 | No events in the past | A new event's start must be strictly later than the server's current time. Server validation is authoritative; the client may mirror it. A draft with a past start may be edited to a future start. A past-dated draft cannot be published. | C4 |
| 6 | Past-event attendance labels | Events whose start has passed show neutral attendance counts on the board and the detail page — no "be the first to register", no places-left wording. "Past" keeps its existing meaning: start time has passed. | C2 |
| 7 | Hosts participate automatically | Every host (organizer and co-hosts) is a participant by virtue of the role, with **no** Registration row. Hosts count toward capacity, cannot opt out while hosts, and cannot register, request, withdraw, or approve/reject their own registration. Admins who are not hosts register normally. All attendance displays and capacity rules reflect host participation. See §11 for H1–H3. Reverses `TASKS.md` §4 "A host is not automatically an attendee." | C6 |
| 8 | No rescheduling past events | Once an event has started, its start and end are locked. A cancelled event's start and end are always locked. Other edits stay available where existing rules allow. Drafts with past dates may be corrected to future dates. Publishing a past-dated draft is refused. Server time decides. | C4 |
| 9 | Rejected users on open events | A previously rejected user may register again only while the event's access is `open` — not `invite`. Registration is explicit; nothing is auto-approved on an access change. The existing seat-claim protocol is reused. The normal register action is shown, with an explanatory note beside it (approved during C3, mirroring the removed-on-open note): "הבקשה שלכם לא אושרה בעבר, אבל עכשיו האירוע פתוח ואפשר להירשם. ההרשמה תאושר מיד." | C3 |
| 10 | Long names | Long names truncate with an ellipsis on `/events` cards and on `/events/[id]`, with no horizontal page overflow. The full name stays accessible. No redesign. | C2 |
| 11 | Gender-neutral removal confirmation | Replace the first sentence of `removeAttendeeDialogMessage` with: "ההרשמה של {name} תוסר מרשימת המשתתפים, והמקום באירוע יתפנה. אפשר יהיה להחזיר את ההרשמה מאוחר יותר, כל עוד יש מקום באירוע." Behaviour unchanged; the invite-only suffix stays. No wider localization audit. | C2 |

## 3. Branches and boundaries

Each branch is cut from the current `origin/yardenah/events-board` after a
fetch, and merged back through its own PR before the next is cut.

### C1 — `yardenah/remove-workshop-pages` (change 4)

- `app/page.tsx` becomes a redirect to `/events` (check the redirect API in
  `node_modules/next/dist/docs/` first, per `AGENTS.md`); delete
  `app/page.module.css`.
- Delete `app/styleguide/` (`page.tsx`, `InteractiveDemos.tsx`,
  `styleguide.module.css`).
- `components/layout/AppShell.tsx`: brand link → `/events`; remove the
  `/styleguide` `NavLink`. Remove `APP_LABELS.navStyleGuide` from
  `lib/labels.ts`, and any other label that becomes unused.
- Fix comments that cite `/styleguide` (`lib/seed.ts`, `lib/data/events.ts`).
- **Out of scope:** deleting components. After this branch `SegmentedControl`,
  `Spinner`, `Radio`, `CardFooter` and the `BadgeVariant` type are no longer
  used by any page; they are kept deliberately and their fate is M11's
  (recorded in `TASKS.md` §5 "M11 — System redesign").
  `SEED_EVENT_IDS` stays (the seed uses it).

### C2 — `yardenah/ui-text-fixes` (changes 6, 10, 11), one commit per change

- **6:** `components/events/EventCard.tsx` uses the neutral count when the event
  is cancelled **or** `isPast(event.startsAt)`, and drops the "full" styling for
  a started event (rename `cancelledAttendanceLabel` to reflect the wider use).
  `components/events/RegistrationPanel.tsx` shows `CapacityMeter` for every
  non-cancelled event today; a started event gets the neutral count instead.
- **10:** reproduce first, then fix — see §7 "Long names" for what is verified
  and what is not.
- **11:** `lib/labels.ts` `removeAttendeeDialogMessage`, wording in §2.
- **Out of scope:** any other copy, any card or list redesign.

### C3 — `yardenah/rejected-reopen` (change 9)

- `lib/permissions.ts` `getRegistrationAvailability`: the `rejected` refusal
  becomes `status === "rejected" && event.access !== "open"`, mirroring the
  existing `removed` exception. Update the comment.
- `lib/labels.ts` `registrationCtaCopy`: a rejected viewer who may register
  gets the explanatory note in §2 instead of the normal one, beside the same
  register action and badge — the removed-on-open convention. Approved during
  C3; it replaces the original "no new copy" boundary.
- Nothing else in code: `claimSeat` already revives the row (see §6).
- **Out of scope:** `invite` access, auto-approval, any copy beyond that note.

### C4 — `yardenah/event-date-rules` (changes 5, 8)

- One pure scheduling rule taking the stored event (or none, on create), the
  incoming start/end and `now`, called by `POST /api/events`,
  `PATCH /api/events/[id]`; publishing checks `isPast(startsAt)`. Place it
  beside the parser in `lib/eventInput.ts` or in `lib/permissions.ts` as an
  availability — **not inside `parseEventForm`** (see §7).

  | Event | Start/end editable | If the start changes |
  | --- | --- | --- |
  | Being created | — | must be > now |
  | Draft, any date | yes | must be > now |
  | Published, not started | yes | must be > now |
  | Published, started | **locked** | — |
  | Cancelled, any date | **locked** | — |

- Date-rule failures: 400 with field errors (the form renders them inline).
  Publishing a past-dated draft: 409, like the route's other lifecycle refusals.
- Client mirror in `components/events/EventForm.tsx`: locked inputs disabled and
  not sent; the start input's `min` set on the client only (hydration).
- **Out of scope:** fixing the server/browser time-zone mismatch in general (§7).

### C5 — `yardenah/soft-delete-events` (change 3)

- New migration `migrations/0003_…sql`:
  `ALTER TABLE dbo.Events_Events ADD DeletedAt datetime2(3) NULL;`
  `0001` and `0002` are immutable and untouched.
- Reads in `lib/data/events.ts`: add `DeletedAt IS NULL` to `SELECT_EVENTS`,
  `SELECT_EVENT`, `SELECT_EVENT_FOR_UPDATE` and `LOCK_EVENT`.
- `removeEvent()` keeps its lock-first ordering, then
  `UPDATE … SET DeletedAt = @now, UpdatedAt = @now WHERE Id = @id AND DeletedAt IS NULL`;
  the three child `DELETE`s go.
- `updateEvent`'s predicate gains `AND DeletedAt IS NULL`. That stops a late
  write, but `PATCH /api/events/[id]`, publish and cancel all turn a `null`
  update into 409 "stale" today. Each must, after a `null` update, re-read the
  event: missing or deleted → 404; still present → keep today's 409. This is the
  same deleted-versus-stale rule as the registration writes below.
- `EventRecord` gains no field — a deleted event never reaches the domain.
- **The three non-seat registration writes** — withdraw
  (`DELETE /api/events/[id]/registrations`), reject and remove — must not
  succeed on a registration whose event has been soft-deleted. Today they load
  the event, then call `db.registrations.update()` with no lock; only hard
  deletion stops a late write (it removes the row, so the update matches
  nothing). Approved direction:
  - extend the existing single `UPDATE` in `updateRegistrationOn`
    (`lib/data/registrations.ts`) with an active-parent condition — an
    `EXISTS` on `dbo.Events_Events` for the registration's event with
    `DeletedAt IS NULL`, a SQL Server 2008 R2 construct — keeping the
    expected-status compare-and-set exactly as it is;
  - when the update affects no row, the route re-reads the event: missing or
    deleted → 404; still present → today's 409 "stale";
  - **no** event-row locking transaction for these three as the default
    design — they stay lock-free single statements, as
    `docs/sql-server-2008r2-compatibility.md` documents.

  This is a planning direction, not a proven design: C5 must validate it (§7)
  and, if it cannot guarantee the behaviour, stop and reassess rather than
  proceed.

  **Outcome (C5 Slice 2, 2026-10-26): the lock-free direction failed
  validation and was replaced, with approval.** On Azure SQL DEV
  (`READ_COMMITTED_SNAPSHOT` and optimized locking both on), a withdraw,
  reject or remove whose `UPDATE` waited on its registration row while a
  delete committed resumed and wrote the row — 200 after the delete — because
  the `EXISTS` was evaluated before the wait and not after it. A
  `READCOMMITTEDLOCK` hint on the `EXISTS` was tried experimentally and did not
  prevent it. The approved correction is the fallback named above: the three
  writes run as a short transaction that takes the event-row lock first
  (`lockEvent`, the filtered `LOCK_EVENT` with `UPDLOCK, ROWLOCK`) and then
  makes the unchanged compare-and-set update (`transitionRegistration` in
  `lib/data/registrations.ts`). A delete committed first leaves nothing to
  lock — 404, no write; a write that locked first makes the delete wait and is
  ordered before it; a moved row is 409. The `EXISTS` stays as a second guard.
  These three routes take 404/409 from the transaction's outcome and do not
  re-read the event; the re-read (`eventExists` in `lib/events.ts`) serves
  edit, publish and cancel. Trade-off: these writes now serialise with
  everything else that locks the same event row. Recorded in `dec_log.md`
  (2026-10-26).
- **Out of scope:** restore, purge, admin visibility, delete-dialog copy (its
  wording stays true from the user's point of view).

### C6 — `yardenah/host-participation` (change 7)

- **Attendance = hosts + `going` rows of non-hosts**, computed identically in
  both places that count (§6): `lib/events.ts` (in-memory, for display) and
  `countGoing` in `lib/data/registrations.ts` (SQL, used by the seat protocol).
- `getRegistrationAvailability`: new `closed` reason `host` for anyone who hosts
  the event, closing register, request and withdraw; its note in
  `lib/labels.ts`. Position relative to the draft/cancelled/started closures is
  an implementation choice.
- `getRequestDecisionAvailability` and the approve/reject routes refuse a row
  whose `userId` is a host (409) — defence in depth.
- Displays: board card count and avatars, detail meter and count, and "Who is
  going" (hosts first, no badge, no duplicates) include hosts. The approval
  queue, the host's attendee rows (remove/restore) and the delete dialog's count
  exclude host rows.
- Seed fixtures adjusted (§11 H1).
- **Out of scope:** co-host management, any data-changing migration, `db:reset`.

## 4. Implementation and merge order

1. **C1** remove-workshop-pages
2. **C2** ui-text-fixes
3. **C3** rejected-reopen
4. **C4** event-date-rules
5. **C5** soft-delete-events
6. **C6** host-participation

The order is strictly sequential: each branch is cut from the integration
branch only after its predecessor's PR is merged (§3). C4 and C5 have little
file overlap, but that does not make them parallel work — they follow the same
order as every other branch.

## 5. Dependencies and sequencing rationale

- **C1 first, because `/styleguide` consumes the components later branches
  change.** It renders `EventCard`, `CapacityMeter`, `AttendeeList` and others
  with hand-written props (e.g. a synthetic `goingCount`). Every prop or
  semantic change in C2 and C6 would otherwise have to be mirrored into a page
  that is about to be deleted.
- **C2 before C6:** C6 changes the number C2's neutral label displays; doing the
  presentation first keeps C6 to counting.
- **C3 before C6:** both edit `getRegistrationAvailability`; the one-line change
  lands first so C6 builds on it.
- **No code dependency between C4 and C5:** soft deletion filters below every
  rule; date rules sit in the content write path. They still run in the
  sequential order of §4.
- **C6 last:** highest risk, touches the seat-claim protocol, and benefits from
  every earlier simplification.
- **Shared files:** `lib/labels.ts` (C1, C2, C6 — different functions);
  `lib/seed.ts` (C1 comments, C6 fixtures); `EventCard`/`RegistrationPanel`
  (C2, C6); `lib/data/registrations.ts` (C5 `updateRegistrationOn`, C6
  `countGoing`) and the reject route (C5's 404/409 mapping, C6's host refusal).
  Merging in order avoids conflicts.
- **C5 before C6, deliberately sequential:** C6 starts only after C5 is merged,
  and builds on C5's versions of those files — it must keep the active-parent
  condition on registration writes and the deleted-parent 404 in the reject
  route while adding host exclusion and the host refusal.

## 6. Architectural decisions and invariants

These hold across the branches. Each is recorded in `dec_log.md` by the branch
that implements it.

- **Rules have one home.** Every new rule (scheduling, host closure, rejected on
  open) lives in the shared rules layer and is called by both pages and routes.
  The server is authoritative; a client mirror is UX only.
- **Soft deletion lives in the data layer.** A deleted event is filtered by the
  four event-read statements, so pages and routes keep returning their existing
  404, and the seat protocol and invitation writes see "gone". **Every future
  event read must include `DeletedAt IS NULL`.** Child rows are preserved and
  simply unreachable. This supersedes the deletion half of the 2026-09-01 entry
  "Host edits never destroy a registration; deleting deliberately does".
- **A registration write checks its parent in the same statement.** Because
  child rows now outlive their event, a registration `UPDATE` must not match a
  row whose event is soft-deleted. The non-seat transitions (withdraw, reject,
  remove) stay lock-free single statements: expected-status compare-and-set
  plus the active-parent condition, with 404 for a deleted parent and 409 for a
  stale transition. Seat-taking writes are already covered by the event-row
  lock and the filtered `SELECT_EVENT_FOR_UPDATE`.
  **As implemented in C5:** the parent check in the same statement is kept,
  but it proved insufficient on its own, and withdraw, reject and remove now
  take the event-row lock first, like the seat-taking writes — see the C5
  outcome in §3. The invariant that holds: a registration mutation never
  commits after a completed delete of its event unless it was ordered before
  that delete by the event-row lock.
- **Deleted is 404, stale is 409, on every write.** Any write that affects no
  row because its event was deleted between the handler's read and its write —
  event content edits, publish and cancel as well as the registration writes —
  answers 404, never a 409 or a 200.
- **Host participation is derived, never stored.** No Registration row is
  created for a host. Attendance and capacity are `hosts + non-host going rows`
  in both the SQL count and the application count, which must stay identical.
  Any Registration row belonging to a host is ignored by counts, lists, the
  queue and decisions.
- **Seat-claim protocol is unchanged in shape.** `lib/data/seats.ts` stays the
  only runtime path to `going` (claim, approve, restore): lock the event row,
  re-count, re-run the rule, write with an expected-status predicate. C6 changes
  only what the count includes — the host count comes from the event that
  `readEventForUpdate` already loads under the lock.
- **Co-hosts are not covered by the event lock**, which is safe only because no
  product path changes `coHostIds` (PATCH cannot reach it; only the seed writes
  it). Any future co-host management must take the event-row lock first.
- **Rejected on an open event reuses `claimSeat`**, which already revives the
  existing row as a new cycle (clearing message and decision fields), guarded by
  a compare-and-set on `rejected`. One row per person and event is preserved; a
  concurrent host approval serialises on the same lock, and whichever runs
  second re-reads the row as `going` and is refused with a 409 by the rule —
  not through the stale-write outcome.
- **"Past" means started:** `isPast(startsAt)`, as everywhere else. An event in
  progress is past.
- **Capacity may be below attendance**, now including below the host count (H2).
  Nothing evicts anyone.

## 7. Risks and implementation edge cases

### Date edits: time zone and minute precision (C4)

`toFormValues()` builds the edit form's `datetime-local` values **on the server**,
in the server's time zone, truncated to the minute; the browser parses them back
in **its** time zone. Re-submitting an untouched started event can therefore
send a start that differs from the stored one (lost seconds; an hour shift when
server and browser zones differ). With dates locked, that would refuse every
ordinary edit of a started event. Required handling:

- the form does not send locked date fields (PATCH falls back to stored values);
- the server treats a submitted date as unchanged when it equals the stored one
  at minute precision.

The underlying zone mismatch is pre-existing and stays out of scope.

### Other date edge cases (C4)

- Do not put "start > now" inside `parseEventForm`: PATCH fills omitted fields
  from stored values, so it would refuse every edit of a started event.
- A past draft may still be edited without touching its dates.
- If the event starts between page load and save, the server's clock decides
  (last-write-wins, as cancellation already accepts).
- Raw API callers sending a zone-less timestamp are parsed in the server's zone —
  existing behaviour, unchanged.

### Long names — reproduce before fixing (C2)

The cause is **not yet established**. An earlier diagnosis (that `.host` cannot
shrink without `min-width: 0`) was wrong and is withdrawn. What the CSS shows:

- **Board card:** `.host` (`EventCard.module.css`) already has
  `overflow: hidden`, `text-overflow: ellipsis` and `white-space: nowrap`. A
  flex item whose overflow is not `visible` already has an automatic minimum
  width of 0, so it can shrink inside `.footer`. The card has
  `overflow: hidden`, and the grid columns are `minmax(310px, 1fr)`. Why the
  reported name is cut off without an ellipsis is unknown.
- **Detail page:** `.person` (`components/ui/Avatar.module.css`) already has
  `min-width: 0`. `.personText` is a column flex container with
  `align-items: flex-start`, and `.personName` has the ellipsis rules. One
  candidate, unconfirmed: with `flex-start`, a `nowrap` name keeps its full
  text width, so its ellipsis never applies and it overflows the page. The
  wrapping lists (`.people` in `detail.module.css`, `.attendee` and `.flagged`
  in `AttendeeList.module.css`) are other places to look.

Required approach:

- reproduce on both screens with the long-name development event the user
  created, and identify in the browser which element actually overflows or
  clips, and why;
- choose the smallest CSS change that fixes that element, without speculative
  `min-width` or `max-width` additions and without redesigning the card or the
  lists;
- keep the requirement: long names truncate with an ellipsis, the layout never
  overflows horizontally, and the full name stays available (a `title` where
  text is truncated; the avatar already has `title={user.name}`; the full text
  stays in the DOM for screen readers);
- check the other places `Person` is used in the same pass — hosts, attendees,
  the removed group, `ApprovalQueue`, `InvitationList`, and the share-email
  picker in the 320px aside.

### Soft deletion (C5)

- A future query that forgets the filter leaks deleted events. Document the
  convention in `memory/a_system.md`; a shared SQL fragment is optional.
- Board loading reads all registrations; rows of deleted events are dropped when
  grouped against the filtered event list. Verify, do not assume.
- `db:reset` hard-deletes all rows, soft-deleted ones included — correct for a
  dev reset. Seed inserts name their columns, so `DeletedAt` defaults to NULL.
- The migration targets the shared DEV database: `db:migrate` runs only with
  explicit approval.

### Soft deletion racing in-flight writes (C5)

The race: withdraw, reject and remove read the event, then update the
registration in a separate, lock-free statement. Under soft deletion a delete
can commit in between, and without the active-parent condition the update would
still match the preserved row and return 200 for a nonexistent event. Today's
hard delete hides this by deleting the row. Every other write path is already
covered: seat claims, approvals, restores, inviting and revoking read the event
through the filtered `SELECT_EVENT_FOR_UPDATE`, and `updateEvent` gains its own
`DeletedAt IS NULL` predicate. The three routes above are the only callers of
the generic registration update.

The event handlers have the same race in a milder form. Content edit, publish
and cancel read the event, then call `db.events.update()`. With the new
predicate a delete committed in between makes the update affect no row, so no
late write lands, but the handler would answer 409 "stale" instead of 404. That
is why §3 requires the same re-read after a `null` update. Their update is a
single statement on the event row itself, the row the soft delete also writes,
so it adds no lock-ordering question.

The single-statement design is expected to be safe, but **C5 must establish
that, not assume it**:

- **Isolation mode.** `db:check` reports whether the target uses
  `READ_COMMITTED_SNAPSHOT` (Azure SQL's default) or locking `READ COMMITTED`
  (stock 2008 R2). Under locking read committed the `EXISTS` takes a shared lock
  on the event row and waits for an in-flight soft delete. Under row versioning
  it reads the last committed version, so an update that does not see an
  uncommitted delete is ordered before it. Confirm both outcomes are acceptable
  on the engine actually used, and say which engine the evidence came from.
- **Lock ordering.** The `EXISTS` reads the event row *after* the registration
  row is locked — an exception to the documented "event row first" ordering.
  It is expected not to deadlock: it is a shared read, compatible with the
  seat protocol's `UPDLOCK`, and the transactions that hold the event row
  exclusively (soft delete, content edit, publish, cancel) never wait on
  registration rows. Verify this, and record the exception and the reason it is
  safe. A future transaction that holds the event row exclusively and then
  writes registrations would break the argument.
- **Seat-claim callers.** `updateRegistrationOn` is also used inside the seat
  protocol's transactions, which already hold the event lock; there the
  condition is redundant but must not change their outcome.
- **If any of this fails** — a deadlock, a write that lands after the delete
  is visible, or a 404/409 that cannot be told apart reliably — stop C5 and
  reassess the design (for example, a locked transaction for these three
  writes) with approval, rather than proceeding.

**What C5 found.** Isolation mode: `READ_COMMITTED_SNAPSHOT` on, and —
which `db:check` does not report — optimized locking on, on Azure SQL DEV.
The second bullet's failure occurred: a write landed after the delete was
committed and visible, when the registration `UPDATE` was blocked on its own
row during the delete (reproduced through the API for withdraw, reject and
remove, and directly in SQL). The event handlers behaved as expected: their
`UPDATE` targets the event row, so a delete during their wait left them
affecting nothing, and they answered 404. C5 stopped, and the locked
transaction was approved; the outcome is in §3. Retested in both orders after
the change: no write after a committed delete, the delete waiting on a
transition that locked first, one winner and one 409 for concurrent
transitions on a live event, and no deadlock. Lock ordering needs no exception
any more — the three writes now take the event row first. Not run on a real
2008 R2.

### Host participation (C6)

- The SQL count and the in-memory count must agree; review them side by side.
- Existing events may now read as over capacity — allowed (H2).
- A new event shows one participant (its organizer); `capacity: 1` is full on
  creation — allowed (H2).
- Existing `pending`/`rejected` host rows must disappear from the queue and be
  undecidable.
- Invite-only: no change — hosts already see the event, and inviting a manager
  is already refused.
- Admin who is also a host: host wins. Admin who is not a host: unchanged.
- The edit form's capacity hint and the delete dialog's count: hint includes
  hosts; delete dialog counts registrations only.

## 8. Verification per branch

Every branch runs the full command chain in [CLAUDE.md](../CLAUDE.md) "Before
you say you are done" — it is authoritative and is not restated here, and it
includes `check:tsql`, which every branch runs whether or not it touches SQL —
then clicks through as at least one organizer and one member (personas: Maya and
Daniel organizers, Priya and Tom members, Sara admin). There is no automated
test suite; temporary harnesses may be used but are not committed.

| Branch | Specific checks |
| --- | --- |
| C1 | `/` → `/events`; brand → `/events`; `/styleguide` 404s; nav has one entry; no unused-import lint errors; every page still renders. |
| C2 | Upcoming, in-progress, past and cancelled events on the board and detail page show the right wording. A long Latin name and a long Hebrew name: ellipsis on the card, no page scroll on the detail page (hosts, attendees, removed group, queue, invitations). Both themes, narrow viewport. Removal dialog wording. |
| C3 | As Priya, rejected on an `approval` event → closed. Switch to `open` → normal register → `going`. Back to `approval` after another rejection → closed. `invite` → still closed. Full `open` event → refused. Register and host-approve near-simultaneously → one wins, the other gets a 409. |
| C4 | `curl`: create with a past start and with start = now → 400; future → 201. Edit a past draft to the future → ok; edit only its title → ok. Publish a past-dated draft → 409. Started event: edit description through the form → ok; change dates via `curl` → 400. Cancelled event: change dates → 400. |
| C5 | Migrate (approved). Delete an event with registrations and invitations → board, detail, every route 404/absent for every persona, admin included; rows still in the database. Second delete → 404. `db:seed -- --status` sane. **Parent check:** after a soft delete, the data-layer update of one of its registrations returns `null`, and withdraw, reject and remove each answer 404. **Race:** with a soft delete held open in a separate session, withdraw, reject and remove each either complete before the delete or answer 404 after it — never 200 after the delete is visible; record the isolation mode `db:check` reports. **Event handlers:** with a delete landing between the handler's read and its update, content edit, publish and cancel each answer 404 and write nothing. **404 vs 409:** a stale transition on a live event — a registration change, or a publish or cancel that lost to another one — still answers 409; a deleted event answers 404. **Regression:** on a live event, concurrent transitions (e.g. withdraw vs host approval, two rejects, remove vs withdraw) still produce exactly one winner and a 409 for the loser, with no deadlock. |
| C6 | Hosts see a host state and no register/withdraw action. Counts, meter, avatars and "Who is going" include hosts, first, no duplicates. A host's existing row is ignored everywhere. Capacity with hosts counted refuses the last-seat claim, including two near-simultaneous `curl` claims. Queue shows no host rows; host self-decision → 409. New event shows one participant. Co-host Daniel on `tsWorkshop`; Sara as admin-host and as non-host admin. |

## 9. Documentation per branch

| Branch | Update |
| --- | --- |
| C1 | `CLAUDE.md` (replace "Check /styleguide" with the component directories); `README.md` (routes, directory map); `TASKS.md` §3 and the M11 text naming the in-app `/styleguide`; `memory/MEMORY.md`, `a_system.md` (pages; "Language and direction" mentions `/`), `r_references.md`, `s_status.md`; `dec_log.md` entry. |
| C2 | `memory/a_system.md` where it describes past-event presentation; `s_status.md` only if it states the old behaviour. |
| C3 | `TASKS.md` §4 "Withdrawing"; `dec_log.md` entry refining 2026-09-06 "A rejected request stays approvable…"; `a_system.md` "Registering"; `s_status.md`. |
| C4 | `TASKS.md` §4 scheduling rules; `dec_log.md` entry; `a_system.md` "Managing events"; `d_glossary.md` "started/past" if absent; `s_status.md`. |
| C5 | `dec_log.md` entry superseding the deletion half of 2026-09-01, including the active-parent condition and its validated concurrency argument; `a_system.md` data layer (filter convention), "Managing events" and "Seat-taking and concurrency" (the lock-ordering exception); `docs/sql-server-2008r2-compatibility.md`, the paragraph on transitions that "take no lock" (they now also carry the active-parent condition); `u_environment.md` (migration 0003); `d_glossary.md` "deleted"; `s_status.md`, including the "nothing short of deleting the event frees that seat" passages. |
| C6 | `TASKS.md` §4 (host rule, definition of **full**); `d_glossary.md` (host, participant, attendance); `dec_log.md` entries superseding 2026-08-26 "Invite-only registration admits invited users or managers", the affected parts of 2026-09-30 "A manager's place is not removable…", and recording derived attendance in the seat count; `a_system.md` "Seat-taking and concurrency" (including the co-host lock requirement); `s_status.md`. |

**Retiring this plan.** The last of the six branches to merge also retires this
document. First confirm:

- every rule and decision introduced by C1–C6 is recorded in its authoritative
  home (`TASKS.md`, `CLAUDE.md`, `dec_log.md`, `a_system.md`, `d_glossary.md`,
  `docs/sql-server-2008r2-compatibility.md`);
- `TASKS.md` §5 "M11 — System redesign" still holds every approved M11 item
  from §10 — category colours, the explanatory-note review and what it must
  preserve, and the follow-up on components and types retained after C1 —
  updated if C1–C6 changed anything they name.

Then delete this file and remove its references from `memory/s_status.md`,
`memory/MEMORY.md` and `memory/r_references.md`.

## 10. Deferred work

- **M11 — authoritative in [TASKS.md](../TASKS.md) §5 "M11 — System
  redesign", not here:** change 1 (category colours — palette from the Style
  Guide, superseding the server-assigned accent decision), change 2 (the
  explanatory-note review and the messages it must preserve), and the review of
  the components and types C1 retains (`SegmentedControl`, `Spinner`, `Radio`,
  `CardFooter`, `BadgeVariant`).
- The server/browser time-zone mismatch in edit forms (beyond C4's handling).
- Restoring or purging soft-deleted events.
- Co-host management (would need the event-row lock, §6).
- Cleaning host rows out of an existing database — not planned; they are
  ignored instead (H1).

## 11. Approved decisions H1–H3

- **H1 — Existing host registration rows.** Excluded from attendance counts,
  attendee displays, approval queues and every business operation; hosts
  participate by role. No data-deleting migration. Existing development
  database records are not deleted, and `db:reset` is not run without explicit
  approval. Seed fixtures in `lib/seed.ts` are updated:
  - `sprintRetro`: drop Daniel's `going` registration on his own event.
  - `oncallTraining` (approval, capacity 3, three `going` rows, host Maya): raise
    capacity to 4, so it remains the "exactly full approval event" fixture.

  `db:seed` only inserts into an empty schema, so these take effect only through
  a reset; until then the existing database is handled by read-time exclusion
  (`oncallTraining` reads as 4 of 3, which is allowed).
- **H2 — Capacity below the host count.** Allowed. Such an event is full. The
  rule that capacity may be lower than attendance is preserved; nobody is
  removed automatically.
- **H3 — Hosts in "Who is going".** Included, organizer and co-hosts first,
  counting toward attendance and capacity, with no new badge, and never
  duplicated by a historical Registration row.

## 12. Standard workflow for each branch

1. Verify Git state: current worktree, branch, `HEAD`, uncommitted changes;
   fetch and confirm the integration branch matches `origin`.
2. Read `memory/MEMORY.md`, `memory/s_status.md`, `CLAUDE.md`, this plan's
   section for the branch, and the Memory Bank files it points to.
3. Inspect the current implementation of everything in scope; do not trust this
   plan over the code.
4. Write a branch-specific implementation plan and **wait for approval**.
5. Create the branch from `origin/yardenah/events-board` in a fresh worktree;
   implement only the approved scope.
6. Review the complete effective diff against the integration branch.
7. Fix justified findings; note rejected ones with a reason.
8. Run final verification (§8) and the documentation updates (§9).
9. **Stop before committing** and ask for approval.
10. Commit, push and open a PR against `yardenah/events-board` only when
    explicitly authorized.
11. Review the PR, address justified findings, and merge only when approved.

Never run `db:migrate` or `db:reset`, delete data, or touch another developer's
branch without explicit approval.
