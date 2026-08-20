# a_ — Architecture

How the Events Board is put together: the client/server split, the repository,
the layers, and what each layer is allowed to know.

---

## 1. The stack

| Piece | Version | Why it is here |
| --- | --- | --- |
| **Next.js** | 16.3.1, App Router | Server Components let the permission rule run *before* anything is rendered, so a hidden event is never in the payload |
| **React** | 19.2.8 | Comes with Next 16; Server Components plus interactive client leaves |
| **TypeScript** | ^5, `strict: true` | The domain model in `lib/types.ts` is the contract between store, API and UI. No `any` |
| **CSS Modules** | built into Next | One `.module.css` per component, every value from a token. No Tailwind, no CSS-in-JS, no component library |
| **ESLint** | ^9 + `eslint-config-next` | `npm run lint` |
| **Storage** | none — in-memory | `lib/db.ts` is async and repository-shaped, so a real database is a change of one file |

Three runtime dependencies in total (`next`, `react`, `react-dom`). Adding a
fourth is a decision that gets written into `dec_decisions.md` with a reason.

Path alias: `@/*` → the repo root. So `@/lib/session`, `@/components/ui`.

---

## 2. The client / server line

There is one line in this project that matters more than any other:

```
          BROWSER                    │              SERVER
                                     │
  Client Components ("use client")   │   Server Components (default)
  — state, effects, handlers         │   — read data, decide visibility
                                     │
        fetchJson()  ───── HTTP ────▶│   Route Handlers   app/api/**
                                     │        │
                                     │        ▼
                                     │   Service layer    lib/events.ts
                                     │   Permissions      lib/permissions.ts
                                     │   Identity         lib/session.ts
                                     │        │
                                     │        ▼
                                     │   Repository       lib/db.ts
                                     │        │
                                     │        ▼
                                     │   In-memory store on globalThis
```

**Rules that come out of that picture**

1. `lib/db.ts`, `lib/seed.ts`, `lib/session.ts` and `lib/events.ts` are **server
   only**. A Client Component never imports them — it calls an API route.
2. Identity comes from `getCurrentUser()` on the server, read from the
   `eb_persona` cookie. A `userId` in a request body is never trusted.
3. The permission rule runs on the server, over the whole data set, before
   anything is counted or rendered. Filtering in the browser is not a
   permission check — a hidden card is still in the HTML.
4. `"use client"` goes on the **leaf** that needs interactivity, not on the
   page. `app/layout.tsx` wraps everything in `ToastProvider` (a Client
   Component) but passes `children` as a prop, so pages stay on the server.

---

## 3. The layers

Top to bottom. Each layer may call the one below it, never the one above.

### 3.1 Presentation — `app/**/page.tsx`, `app/layout.tsx`

Server Components. They ask *who is looking* (`getCurrentUser()`), ask the
service layer for data already shaped for the screen, and render. No storage
access, no rule of their own.

Contains: the route tree (`/`, `/events`, `/events/[id]`, `/styleguide`,
`not-found`), page metadata, the section layout of each screen.

### 3.2 Components — `components/`

Three folders, and the split is about *knowledge*, not about size:

| Folder | Knows about | Examples |
| --- | --- | --- |
| `components/ui/` | Nothing domain-specific. Reusable in any app | `Button`, `Badge`, `Card`, `Field`, `Modal`, `Toast`, `Avatar`, `EmptyState`, `Spinner`, `SegmentedControl`, `PageHeader` |
| `components/events/` | The domain — events, access modes, registrations | `EventCard`, `EventGrid`, `EventFilters`, `DateBlock`, `AccessBadge`, `EventStatusBadge`, `RegistrationBadge`, `EventMetaLine`, `EventMetaDetails`, `CapacityMeter` |
| `components/layout/` | The app frame | `AppShell`, `NavLink`, `PersonaSwitcher` |

A `ui/` component that starts taking an `EventRecord` has changed layer and
belongs in `events/`.

### 3.3 Service / domain — `lib/events.ts`, `lib/board-filters.ts`

Where "the board for *this* viewer" is assembled: load, filter by visibility,
derive hosts / `goingCount` / `pendingCount` / the viewer's own registration,
split upcoming vs past, count per access mode. Server only.

`lib/board-filters.ts` is the exception that is **not** server only — it is the
URL contract for the filters (`?category=`, `?access=`), kept free of any `db`
import so the page and the client-side filter bar can both use it.

### 3.4 Permissions — `lib/permissions.ts`

The two questions the whole product turns on, answered in exactly one place:

- `canViewEvent(event, user)` — may this person see it at all?
- `canManageEvent(event, user)` — may they edit, delete, publish, decide?

Plus `isHost()` and `isInvited()`. Pure functions over already-loaded records —
no I/O, no framework, trivially testable. Pages call them to decide what to
render; route handlers call the *same* functions to decide what to return.

### 3.5 Identity — `lib/session.ts`

`getCurrentUser()` and `setCurrentUser()`, over the `eb_persona` cookie. There
is no login: you pick a persona from the top right. Cookies can only be
*written* from a Route Handler, which is why persona switching goes through
`POST /api/session`. `getCurrentUser()` never returns null — it falls back to
`DEFAULT_USER_ID`, so no caller has to handle a logged-out state.

### 3.6 API — `app/api/**/route.ts`

The HTTP boundary for client code. Every handler is wrapped in
`withErrorHandling`, reads its body with `readJson`, throws `ApiError` for
anything the caller got wrong, and returns a plain object on success. Failures
always come back as `{ error: { message, code?, details? } }`, which is what
lets the client have one `fetchJson` instead of bespoke error handling
everywhere.

Route Handlers, **not** Server Actions — deliberately, so the authorisation
boundary is one obvious layer you can read end to end. See `dec_decisions.md`
(D-03).

Existing: `GET | POST /api/session`, `POST /api/dev/reset`.
Not built yet: `/api/events`, `/api/events/[id]`,
`/api/events/[id]/registrations`.

### 3.7 Repository — `lib/db.ts`

The only module in the project that touches storage. Shaped like a real
repository: `db.users`, `db.events`, `db.registrations`, each with async
`list / get / create / update / remove`, plus `db.reset()`.

Three deliberate properties:

- **Every method is async** — swapping in Postgres becomes a change of
  implementation, not a change of every call site.
- **Reads return `structuredClone` deep copies** — a caller mutating what it
  got back cannot corrupt the store.
- **State lives on `globalThis`** — it survives the module re-evaluation that
  `next dev` performs on every save.

Deleting an event also deletes its registrations, so nothing is orphaned.

Data resets when the dev server restarts, or via `POST /api/dev/reset`.

### 3.8 Fixtures — `lib/seed.ts`

5 people, 12 events, registrations covering every state. Timestamps are
computed relative to "now" the first time the store is built, so there is
always a sensible past/present/future spread whenever the project is run.

### 3.9 Utilities — `lib/date.ts`, `lib/cx.ts`, `lib/labels.ts`, `lib/api.ts`

Small, dependency-free, importable from both sides of the line:

- `date.ts` — formatting pinned to `en-GB` so the server and the browser cannot
  disagree and produce a hydration warning. Also `isPast`, `daysUntil`,
  `toDayKey` (grouping for the calendar view), `toDateTimeLocalValue`.
- `cx.ts` — join class names, drop falsy. Replaces a `classnames` dependency.
- `labels.ts` — every user-facing string, so the board and the detail page can
  never disagree about what a pending request is called.
- `api.ts` — `ApiError`, `jsonOk`, `jsonError`, `withErrorHandling`, `readJson`
  (server side) and `fetchJson` (client side).

### 3.10 Design tokens — `app/styles/tokens.css`, `app/globals.css`

`tokens.css` (255 lines) holds every colour, spacing step, radius, shadow, font
size and duration, as a light set on `:root` and a dark set. Components
reference tokens only — no hex codes, no magic pixel values. `globals.css` is
the reset and base elements, and nothing new goes into it.

`/styleguide` renders the whole kit with real data. Look there before building
a new component.

### 3.11 `public/`

Static assets served from the site root. **This project has no `public/` folder
yet** — the only asset in use is `app/favicon.ico`, which Next serves via the
`app/` directory convention, and the fonts come from `next/font/google`. Create
`public/` the first time a real static file (an image, a local font file,
`robots.txt`) is needed.

---

## 4. Request walkthroughs

**Loading the board** — `GET /events?category=design`

1. `app/events/page.tsx` (Server Component) awaits `getCurrentUser()` and
   `searchParams`.
2. `parseBoardFilters()` turns the query string into a `BoardFilters`; unknown
   values are dropped rather than 404ing, so a stale link still shows a board.
3. `getBoard(viewer, filters)` loads events + registrations + users in
   parallel, runs `canViewEvent()` over all of them, derives context, applies
   the category filter, then the access filter, then splits upcoming/past.
4. The page renders `EventGrid` + `EventCard`. An invite-only event this person
   was not invited to **never reached step 4** — it is not in the HTML.

**Switching persona** — `POST /api/session`

1. `PersonaSwitcher` (Client Component) calls `fetchJson("/api/session", …)`.
2. The handler validates `userId` is a non-empty string, looks the user up,
   404s if there is no such persona.
3. `setCurrentUser()` writes the `eb_persona` cookie (httpOnly, lax, 30 days).
4. `router.refresh()` re-renders every Server Component under the new identity.

---

## 5. Where the not-yet-built parts go

| To build | Layer | File |
| --- | --- | --- |
| Detail screen (M2) | Presentation | `app/events/[id]/page.tsx` — currently a stub with **no visibility check** |
| Detail data | Service | a `getEventForViewer(id, viewer)` in `lib/events.ts` returning `null` when `canViewEvent` says no, so the page can `notFound()` |
| Register / withdraw (M3) | API | `app/api/events/[id]/registrations/route.ts` |
| Registration rules | Domain | a `lib/registration.ts` — "is registration open", "what status does registering produce", "is this event full". Called by the route handler *and* by the page that renders the button |
| Create / edit / delete (M4) | API | `app/api/events/route.ts`, `app/api/events/[id]/route.ts` |
| Approval queue (M5) | API + components | `PATCH` on the registrations route, plus a queue component in `components/events/` |

The rule of thumb: **if the client could lie about it, it is enforced in the
route handler.** Hiding a button is a UX affordance, never a permission check.
