# d_glossary — the words this project uses

The anchor of the domain group. **A new term goes in here first**, and every
other doc references it. One definition, never three drifting copies.

Types live in `lib/types.ts`; user-facing wording lives in `lib/labels.ts`.
Where this file and the code disagree, the code is right and this file is a bug.

---

## People

**Persona** — one of five seeded users you "sign in" as from the switcher in the
top right. There is no authentication; the switcher writes the `eb_persona`
cookie, which the server reads on every request. Switching persona is how you
verify visibility rules.

**Role** — what a person may do independent of any single event:
`member` (browse and register) · `organizer` (that, plus create events and
manage the ones they host) · `admin` (manage every event).

**Host** — an event's `organizerId`, or anyone in its `coHostIds`. Not a role: a
relationship to one event. **A host is not automatically an attendee** — they
register like everyone else.

**Viewer** — whoever `getCurrentUser()` returns for the current request. The
only trusted identity on the server.

---

## Events

**Access** (`EventAccess`) — how people get into an event. The heart of the
product.
- `open` — anyone can see it; registering confirms immediately.
- `approval` — anyone can see it; registering creates a request a host decides.
- `invite` — **only hosts and invited people can see it at all**; invited people
  register in one step.

**Status** (`EventStatus`) — the event's lifecycle, separate from who may attend.
- `draft` — hosts (and admins) only; nobody can register.
- `published` — live; visibility follows `access`.
- `cancelled` — still visible to whoever could see it; registration closed.

**Category** — `engineering` · `design` · `product` · `learning` · `social` ·
`company`. A filter on the board, not a permission.

**Capacity** — maximum confirmed attendees. `null` means unlimited.

**Full** — the number of `going` registrations has reached `capacity`. **Only
`going` counts.** `pending`, `cancelled`, `rejected` and `waitlisted` do not.

**Accent** — an `AccentKey` mapping to `--accent-*` tokens in `tokens.css`.
Presentation only.

---

## Registration

**Registration status** (`RegistrationStatus`) — where one person stands with
one event.

| Status | Means | Label shown |
| --- | --- | --- |
| `going` | confirmed; counts against capacity | "Going" |
| `pending` | awaiting a host decision (`approval` events only) | "Awaiting approval" |
| `rejected` | a host declined the request | "Not approved" |
| `cancelled` | the person withdrew | "Not going" |
| `waitlisted` | reserved for the waitlist stretch goal; nothing produces it yet | "Waitlisted" |

**Registering** — `open` → `going`; `approval` → `pending`; `invite` *and
invited* → `going`.

**Registration closed** — true when any of: the event is a `draft` or is
`cancelled`; the event has already started; the event is full and its mode is
`open` or `invite`. On a full `approval` event people **may still request**, but
a host **cannot approve past capacity**.

**Withdrawing** — anyone `going` or `pending` may withdraw, which sets them
`cancelled`. They may register again afterwards. Someone `rejected` may **not**
re-request; a host can still approve them from the queue.

**The approval queue** — the `pending` registrations on an event, shown to hosts
on the event detail page (M5).

---

## The codebase

**The board** — `/events`. The list (later, optionally a calendar) of events the
viewer is allowed to see.

**The detail screen** — `/events/[id]`. One screen, three audiences: someone
deciding whether to register, a host managing the event, and someone who should
get a 404. **There is no separate edit screen.**

**Leak** — an event appearing to someone not allowed to see it. Includes
appearing in an API response even if the browser hides it. The board must never
leak.

**The house style** — the API conventions in `lib/api.ts`, demonstrated end to
end in `app/api/session/route.ts`. See [`a_system.md`](a_system.md).

**The kit** — `components/ui/` (generic) and `components/events/` (domain-aware),
all rendered with real data at `/styleguide`.

**The persona sweep** — the manual check every change goes through: the same
screen as an organizer and as a member. See [`c_conventions.md`](c_conventions.md).

---

## The way we work

**The memory bank** — this directory. Git-tracked, shared, the project's
long-term memory.

**Pinned lesson** — a Symptom / Root cause / Fix / **Generalize** entry in
`dec_log.md`, id `L-YYYYMMDD-NN`. See [`c_memory_protocol.md`](c_memory_protocol.md).

**Memory wrap PR** — the standalone PR that ships memory updates,
`chore/memory-update-YYYY-MM-DD`. Never mixed into a feature diff.

**Orphan edit** — a memory edit made inside a worktree's own `memory/` checkout
instead of through the symlink. It is silently lost. See
[`c_worktrees.md`](c_worktrees.md).

**The inode check** — `./scripts/memory-bank.sh check`. Proof that the symlink
resolves to the real bank. A reflex, not an afterthought.
