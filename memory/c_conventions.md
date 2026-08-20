# c_conventions — how we work here

Canonical. `CLAUDE.md` at the repo root carries the short version so it is in
context from the first token; **if the two ever disagree, this file wins** and
`CLAUDE.md` gets corrected in the next memory wrap PR.

## Read the framework docs, not your memory

`AGENTS.md`: this Next.js (16.3.1) has breaking changes against training data.
Read the relevant guide in `node_modules/next/dist/docs/` before writing
framework code, and heed deprecation notices. Resolve that path from the
repo root — in a worktree it may not be visible until `npm install` has run.

The `AGENTS.md` block is written by `next dev`. Removing it from a diff only
re-creates the uncommitted change; commit it with your work to keep the tree
clean.

## Styling

- Every colour, space, radius, shadow and font size comes from a token in
  `app/styles/tokens.css`. **No hex codes, no magic pixel values in components.**
- One `.module.css` next to each component. Nothing new goes in `app/globals.css`.
- Check `/styleguide` before building a new component — it probably exists.
- Both themes have to work. Tokens handle that automatically if you use them.

## Components

- `components/ui/` — generic primitives that know nothing about events.
- `components/events/` — anything that understands the domain.
- `components/layout/` — the app frame.
- Server Components by default. `"use client"` only on the leaf that needs
  state, an effect or an event handler — not at the top of a page.
- Props are explicit. No prop spreading through several layers.
- Import primitives from the barrel: `import { Button, Card } from "@/components/ui"`.

## Data and permissions

- `lib/db.ts` and `lib/seed.ts` are **server only**. A Client Component that
  needs data calls an API route.
- `getCurrentUser()` from `lib/session.ts` is the only source of identity on the
  server. **Never take a `userId` from a request body and trust it.**
- Every rule in section 4 of `TASKS.md` is enforced **in the route handler**.
  Hiding a button is a UX affordance, not a permission check.
- Answer "can this person see this event" and "can this person manage this
  event" in **one shared place**, and call it from both the pages and the API.
- An event the viewer may not see returns **404, not 403**.

## API routes

Follow `app/api/session/route.ts`: `withErrorHandling` around every export,
`readJson` for bodies, `ApiError` for anything the caller got wrong, a plain
object for success. Client code calls `fetchJson` from `lib/api.ts`.

Route Handlers, **not** Server Actions — that is the convention here, so the
authorisation boundary is a single obvious layer.

## Copy

User-facing words live in `lib/labels.ts`. Import them rather than typing
strings into JSX, so the board and the detail page never disagree about what to
call a pending request.

## Adding a dependency

Don't, unless you say why first. The stack is deliberately small.

## Git

- One worktree, one branch, one PR — see [`c_worktrees.md`](c_worktrees.md).
- Branch names: `<yourname>/<topic>` for feature work,
  `chore/memory-update-YYYY-MM-DD` for memory wrap PRs.
- Commit as you go; the history gets read.
- **Keep issue keys (`KIL-NNN`) out of wrap and chore PR titles, branches and
  commits** unless the PR genuinely completes that issue — the tracker's GitHub
  automation will otherwise auto-close it on merge. See `L-20260820-01` in
  [`dec_log.md`](dec_log.md).
- Memory updates ship as their **own** PR, never mixed into a feature diff.

## Before you say you are done

```bash
npm run typecheck && npm run lint && npm run build
```

Then the **persona sweep** — most bugs in this project are visible only when you
switch. At minimum, one organizer and one member:

1. As **Maya** (organizer, `u-maya`): both invite-only events are on the board.
2. As **Priya** (member, `u-priya`): both are gone, and the count changed.
3. As **Tom** (member, `u-tom`): `/events/e-comp-review` returns **404**, not 403.
4. Curl the API directly as a member — the leak must not be there either:

```bash
curl -s http://localhost:3000/api/events | grep -c comp-review
```

Reset fixtures between sweeps without restarting:

```bash
curl -X POST http://localhost:3000/api/dev/reset
```

## Definition of done

- `typecheck`, `lint`, `build` clean.
- No `any`. No unused exports. No commented-out code.
- CSS Modules using tokens — no inline colours, no new global CSS.
- New components live next to the existing ones and look like them.
- The app works as **all five personas**, not just the one you developed with.
- The lesson is pinned — [`c_memory_protocol.md`](c_memory_protocol.md).
