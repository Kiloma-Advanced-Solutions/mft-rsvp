# d_ — Terminology

The words this project uses. If two files disagree about what something is
called, this file wins and one of them gets fixed.

---

## People

| Term | Meaning |
| --- | --- |
| **User** | A person. `lib/types.ts` → `User`. No login exists; identity is a persona cookie |
| **Persona** | One of the five seeded users you can "sign in" as from the top right. Switching persona is how visibility rules are tested |
| **Viewer** | The user currently looking at a screen — whoever `getCurrentUser()` returned. The word used in `lib/events.ts` for "this request's user" |
| **Role** | What a person may do *independent of any single event*: `member`, `organizer`, `admin` |
| **Host** | Event-specific, not a role. The event's `organizerId`, or anyone in its `coHostIds`. `isHost()` in `lib/permissions.ts` |
| **Organizer** | Two meanings, watch out: (a) the role `organizer`, (b) `event.organizerId`, the person who created that event and is always a host |
| **Co-host** | A user in `coHostIds`. Same powers over that event as the organizer |
| **Invitee** | A user in `invitedUserIds`. Only meaningful on an `invite` event. `isInvited()` |
| **Attendee** | Someone whose registration is `going`. A host is *not* automatically an attendee — they register like everyone else |

### Roles

| Role | May |
| --- | --- |
| `member` | Browse and register |
| `organizer` | The above, plus create events and manage the ones they host |
| `admin` | Manage every event in the system |

### The five personas

| Persona | Id | Role | Use them to test |
| --- | --- | --- | --- |
| Maya Cohen | `u-maya` | organizer | Hosting, editing, the approval queue. Also the default persona |
| Daniel Ross | `u-daniel` | organizer | An organizer looking at *someone else's* event |
| Priya Nair | `u-priya` | member | The plain attendee experience |
| Tom Alvarez | `u-tom` | member | Someone with a rejected request |
| Sara Klein | `u-sara` | admin | Managing an event they do not host |

---

## Events

| Term | Meaning |
| --- | --- |
| **Event** | `EventRecord` in `lib/types.ts`. Title, summary, description, start/end, location, category, accent, capacity, access, status, hosts, invitees |
| **Access mode** | *How people get in.* `open`, `approval` or `invite`. The heart of the product |
| **Status** | *The lifecycle of the event itself*, separate from access. `draft`, `published`, `cancelled` |
| **Category** | `engineering`, `design`, `product`, `learning`, `social`, `company`. A filter on the board |
| **Accent** | A colour key (`violet`, `blue`, `emerald`, `amber`, `rose`, `cyan`) mapping to `--accent-*` tokens. Purely visual |
| **Capacity** | Maximum confirmed attendees. `null` means unlimited |
| **Full** | The number of `going` registrations has reached `capacity`. Only `going` counts — `pending`, `cancelled`, `rejected` and `waitlisted` do not |
| **Location** | A flat object with `kind` (`in_person` / `online` / `hybrid`) plus optional `venue`, `address`, `url`, `platform`. Flat on purpose so one form can edit it without branching |

### Access modes

| Mode | Label in the UI | Who can see it | What registering does |
| --- | --- | --- | --- |
| `open` | "Open" | Everyone | Confirms them immediately → `going` |
| `approval` | "Approval needed" | Everyone | Creates a request → `pending` |
| `invite` | "Invite only" | Hosts, admins and invited people **only** | Confirms them immediately → `going` |

### Statuses

| Status | Label | Meaning |
| --- | --- | --- |
| `draft` | "Draft" | Visible to hosts and admins only. Nobody can register |
| `published` | "Published" | Live. Visibility follows the access mode |
| `cancelled` | "Cancelled" | Still visible to whoever could see it. Registration closed |

---

## Registrations

| Term | Meaning |
| --- | --- |
| **Registration** | One person's relationship to one event. At most one row per (event, user) pair |
| **Register** | The act. What it produces depends on the access mode |
| **Request** | What registering on an `approval` event produces — a `pending` registration, optionally with a `message` |
| **Withdraw** | Someone who is `going` or `pending` steps back. Sets them to `cancelled`. They may register again afterwards |
| **Approve / reject** | A host decides a `pending` request. Writes `decidedBy` and `decidedAt` |
| **Approval queue** | The list of `pending` requests a host sees on the event detail page (M5) |

### Registration statuses

| Status | Label in the UI | Counts against capacity |
| --- | --- | --- |
| `going` | "Going" | **Yes** |
| `pending` | "Awaiting approval" | No |
| `rejected` | "Not approved" | No |
| `cancelled` | "Not going" | No |
| `waitlisted` | "Waitlisted" | No. Stretch goal — nothing produces this status yet |

**Registration is closed** when any of these is true:

- the event is a `draft` or is `cancelled`;
- the event has already started;
- the event is full **and** its mode is `open` or `invite`.

On a full `approval` event people may still request a place — but a host
cannot approve past capacity.

Someone who was `rejected` may not re-request. A host can still approve them
from the queue.

---

## Screens and the board

| Term | Meaning |
| --- | --- |
| **The board** | `/events`. The list of events this person is allowed to see |
| **Detail screen** | `/events/[id]`. One screen, three audiences: an attendee deciding, a host managing, and someone who should get a 404 |
| **Upcoming / Past** | The board's two sections. An event moves to "past" once it has *started*, which is the same line that closes registration and dims the card |
| **Styleguide** | `/styleguide`. Every component in the kit, rendered with real data |
| **Start page** | `/`. What is built, what is yours, and the personas |

---

## Code-level vocabulary

| Term | Meaning |
| --- | --- |
| **Token** | A CSS custom property in `app/styles/tokens.css`. The only legal source of a colour, space, radius, shadow or font size |
| **The kit** | `components/ui/` — the generic primitives |
| **Repository** | `lib/db.ts`. The only module that touches storage |
| **`EventWithContext`** | An event plus what a screen always needs alongside it: hosts, `goingCount`, `pendingCount`, the viewer's own registration, `viewerCanManage` |
| **`BoardEvent`** | An `EventWithContext` plus `attendees` — the faces in the card's avatar stack |
| **`Board`** | What `getBoard()` returns: `upcoming`, `past`, `visibleCount`, `accessCounts` |
| **`BoardFilters`** | `{ category, access }`, each `null` for "no filter". Parsed from the query string |
| **`ApiError`** | The error a route handler throws. `withErrorHandling` turns it into a clean response |
| **`fetchJson`** | The client-side fetch helper. Unwraps success, throws the server's message on failure |

---

## Two distinctions worth keeping straight

1. **Access is not status.** An event can be `draft` + `open`, or `published` +
   `invite`, or `cancelled` + `approval`. Access says *who gets in*; status
   says *what state the event itself is in*.
2. **Host is not a role.** `organizer` is a role; host is a relationship to one
   specific event. Daniel is an `organizer` but not a host of Maya's event, and
   so may not edit it. Sara is an `admin` and may manage every event without
   being a host of any.

---

## Words we do not use

| Not this | Use this | Why |
| --- | --- | --- |
| "RSVP" | Registration | The repo is called `mft-rsvp`, but the product's word is "register" |
| "Owner" | Organizer, or host | `organizerId` is the field name |
| "Private event" | Invite-only event | Matches the `invite` access mode |
| "Signed in user" | Viewer, or current user / persona | There is no sign-in |
| "Utils" | `lib/` | The folder is called `lib/` |
| "Denied" | Rejected | Matches the `rejected` status and its label "Not approved" |
