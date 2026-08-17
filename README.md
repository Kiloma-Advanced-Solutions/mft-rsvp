# Events Board

An internal events board: organizers publish events, everyone else finds them
and registers. Events open up in one of three ways — freely, behind an approval
step, or by invitation only.

This repository is the **starting point for a Claude Code workshop**. The design
system, UI kit, data layer, session handling and API conventions are done. The
product is not.

- **The brief:** [`TASKS.md`](TASKS.md)
- **The house style:** [`CLAUDE.md`](CLAUDE.md)

## Getting started

```bash
npm install
```

```bash
npm run dev
```

Then open <http://localhost:3000>. The start page explains what is built and what
is yours, and `/styleguide` renders every component in the kit with real data.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Production build |
| `npm run typecheck` | Generate route types, then `tsc --noEmit` |
| `npm run lint` | ESLint |

## How it fits together

```
app/
  page.tsx              Start here — what is built, what is yours
  events/               The board and the event detail screen  ← your work
  styleguide/           Every component, rendered
  api/session/          Persona switching, and the API house style to copy
  api/dev/reset/        Reload the fixtures without restarting
  styles/tokens.css     Design tokens, light and dark
components/
  ui/                   Generic primitives
  events/               Event cards, badges, date blocks, capacity meters
  layout/               App shell, nav, persona switcher
lib/
  types.ts              The domain model
  db.ts                 In-memory store (server only)
  seed.ts               12 events, 5 people, every state covered
  session.ts            Who the current user is
  api.ts                Route handler and fetch helpers
  labels.ts             User-facing copy
  date.ts               Date formatting and grouping
```

## There is no authentication

You "sign in" by picking a persona from the top right, which sets a cookie the
server reads on every request. Switching persona is how you verify the
visibility rules — an invite-only event should disappear entirely for someone
who was not invited.

## There is no database

Data lives in memory and resets when the dev server restarts. `lib/db.ts` is
async and shaped like a real repository, so replacing it later would be a change
of implementation rather than a change of every call site.

To reload the fixtures without restarting:

```bash
curl -X POST http://localhost:3000/api/dev/reset
```
