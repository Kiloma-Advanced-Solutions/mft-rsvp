# c_ — Conventions: how we work

The process rules. `a_architecture.md` says what the layers are; this file says
how we move code into them.

---

## 1. Branch per feature

One feature, one branch, branched from `master`.

```bash
git checkout master && git pull && git checkout -b alona/events-detail
```

| Kind of branch | Name | Example |
| --- | --- | --- |
| A feature | `<name>/<feature>` | `alona/events-detail` |
| Docs / memory bank | `<name>/memory-bank` | `alona/memory-bank` |
| A fix | `<name>/fix-<thing>` | `alona/fix-capacity-count` |

Branches already on the remote follow this shape: `eylon/events-board`,
`peleg/events-board`, `shani-events-board`, `michal-bucks`, `yaniv-branch`.
The `<name>/<feature>` form is the one to copy — it groups in the branch list.

Never commit straight to `master`. `master` moves only through a PR.

---

## 2. Commit after every small task

A commit is one finished thought, not one day of work. If the message needs an
"and", it should have been two commits.

**Good**

```
create events page with filtering
add canViewEvent and canManageEvent
fix capacity counting pending registrations
```

**Bad**

```
wip
fixes
events page + detail page + api + styling
```

Rules of thumb:

- Commit when `npm run typecheck` and `npm run lint` are clean, not before.
- Present tense, lower case, no full stop, under ~60 characters.
- Never commit commented-out code or a `console.log` you meant to delete.
- The history is read as part of the review. It is a deliverable.

`AGENTS.md` at the repo root is written by `next dev` on every run. If it shows
up dirty, commit it along with the work rather than reverting it — reverting
only makes `next dev` re-create it.

---

## 3. Pull requests

Open one when the feature is done, or when the time box is up — whichever comes
first. An honest PR beats a broken one. The template lives in section 8 of
`TASKS.md`:

```markdown
## What I built
## Decisions
## What I did not do
## How to check it
```

Before opening it: run the checks (section 6 below), click through as at least
one organizer and one member, and ask for a review against sections 4 and 6 of
`TASKS.md` — being specific about the standard is what makes the review useful.

After merging, record the PR in `s_sessions.md` and any decision it contained
in `dec_decisions.md`.

---

## 4. Which folder does this file go in

We split by responsibility so the project stays readable. When you write a new
file, this table decides where it lands.

| It is… | Folder | Notes |
| --- | --- | --- |
| A generic, domain-blind UI piece | `components/ui/` | Also export it from `components/ui/index.ts` |
| Anything that understands events | `components/events/` | Takes `EventRecord`, `Registration`, `EventAccess`… |
| The app frame — shell, nav, persona | `components/layout/` | |
| A pure helper (dates, class names, strings) | `lib/` | This project's `lib/` **is** the `utils/` folder — see the note below |
| A function that reads or writes stored data | `lib/db.ts` | The repository. The only file that touches storage |
| Domain logic over already-loaded records | `lib/` (`permissions.ts`, `events.ts`, a future `registration.ts`) | Server only unless it is genuinely free of `db` |
| An HTTP endpoint | `app/api/<path>/route.ts` | Follows `app/api/session/route.ts` exactly |
| A screen | `app/<route>/page.tsx` | Server Component unless it truly cannot be |
| Styling for one component | `<Component>.module.css`, next to it | Never `globals.css` |
| A static asset | `public/` | Does not exist yet — create it when the first asset arrives |
| A note about the project | `docs/` | This memory bank |

### Notes on the names we use

- **`utils` → `lib/`.** This project keeps helpers in `lib/`, not `utils/`. Same
  idea, existing name. Do not create a second `utils/` folder alongside it.
- **`repository` → `lib/db.ts`.** One file today because the store is in
  memory. If it grows, split it into `lib/repositories/{events,users,
  registrations}.ts` and keep `lib/db.ts` as the façade so no call site changes.
- **Server Actions → we do not use them.** The house style is Route Handlers.
  See `dec_decisions.md` (D-03) for the reason and the trade-off. If a form
  ever justifies a Server Action, that is a new decision to record, not a
  quiet exception.
- **`api` → `app/api/**/route.ts`.** All of it, including the endpoints the
  client calls after a button press. There is no second API surface.

---

## 5. Code conventions

**Components**

- Server Components by default. `"use client"` only on the leaf that needs
  state, an effect or an event handler.
- Props are explicit and typed. No prop spreading through several layers.
- Check `/styleguide` before building a new component — it probably exists.
- Copy comes from `lib/labels.ts`, never typed into JSX.

**Styling**

- Every colour, space, radius, shadow and font size comes from a token in
  `app/styles/tokens.css`. No hex codes, no magic pixel values.
- One `.module.css` next to each component. Nothing new in `app/globals.css`.
- Both themes must work. Tokens handle that for free if you use them.

**Data and permissions**

- `lib/db.ts` and `lib/seed.ts` are server only. Client code calls an API route.
- `getCurrentUser()` is the only source of identity on the server. Never trust
  a `userId` from a request body.
- Every rule in section 4 of `TASKS.md` is enforced in the route handler.
- "Can this person see this event" and "can this person manage this event" are
  answered in `lib/permissions.ts` and nowhere else.

**API routes**

- Wrap in `withErrorHandling`, read bodies with `readJson`, throw `ApiError`
  for caller mistakes, return a plain object on success.
- Client code calls `fetchJson` from `lib/api.ts`.

**TypeScript**

- No `any`. No unused exports. No commented-out code.
- Import through the `@/` alias, not long relative chains.

---

## 6. Before you say you are done

```bash
npm run typecheck && npm run lint && npm run build
```

Then click through the app as at least two personas — one organizer and one
member. Most of the bugs in this project are only visible when you switch.

The five personas and what each is for are in `d_terminology.md`.

---

## 7. Working with Claude Code on this project

- Brief one milestone at a time. Point at `lib/types.ts` and
  `app/api/session/route.ts` as the shape to follow, and ask for a plan before
  any code. A wrong plan costs thirty seconds; wrong code costs ten minutes.
- Work in slices you can verify. Build, look at it in the browser, switch
  persona, *then* move on.
- When you catch yourself saying "and also" for the fourth time in one prompt,
  stop and split it.
- Ask Claude to write the PR description from the actual diff, then fix what it
  got wrong about your intent.
- When you correct Claude on something that will come up again, put it in
  `CLAUDE.md` — and the reasoning behind it in this memory bank.
