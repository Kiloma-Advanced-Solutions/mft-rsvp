# Architecture

System boundaries, auth model, API responsibilities, build conventions, and
external systems for this repo. This describes how the pieces fit together —
for process/style rules, see [c_conventions.md](c_conventions.md).

## Layering

```
app/            routes (App Router) — pages + app/api/* route handlers
components/ui/       generic primitives, no domain knowledge
components/events/   anything that understands the events domain
components/layout/   app frame (shell, nav, persona switcher)
lib/            server-only (db.ts, session.ts) + shared (types.ts,
                visibility.ts, events.ts, api.ts, labels.ts, date.ts)
```

Server Components by default. `"use client"` only at the leaf that needs
state, an effect, or an event handler.

## Auth model

`getCurrentUser()` in `lib/session.ts` is the **only** source of identity on
the server. Today it is a dev/workshop stand-in, not real authentication:
it reads an `eb_persona` cookie and falls back to `DEFAULT_USER_ID` when
absent. `setCurrentUser()` writes that cookie from a Route Handler/Server
Function (the `PersonaSwitcher` component uses it to let you demo all five
personas without a login flow).

Even though it's a stand-in, treat it as the trust boundary it's meant to
become: never take a `userId` from a request body, always resolve identity
via `getCurrentUser()` server-side. If real auth ever replaces the cookie
switch, only `lib/session.ts` should need to change.

## API responsibilities

Route handlers under `app/api/*`, not Server Actions — this keeps the
authorization boundary in one obvious layer. Follow the pattern in
`app/api/session/route.ts`:
- every handler wrapped in `withErrorHandling`
- request bodies read with `readJson`
- anything the caller got wrong thrown as `ApiError`
- success returns a plain object

Client code calls `fetchJson` from `lib/api.ts`, which unwraps the payload
and throws the server's message on failure.

Permission checks live in the route handler, not just in the UI.
`lib/visibility.ts` is the one shared place that answers "can this person
see this event" and "can this person manage this event" — call it from
both pages and API routes so they can't drift apart.

## Package / build conventions

- Next.js 16 (App Router), React 19, TypeScript, CSS Modules only.
- `npm run dev` / `build` / `start` — standard Next.js scripts.
- `npm run lint` — ESLint (`eslint-config-next`).
- `npm run typecheck` — `next typegen && tsc --noEmit`.
- This Next.js version has breaking changes vs. training data — see the
  version-awareness rule in [c_conventions.md](c_conventions.md).

## External systems

None yet. `lib/db.ts` is an in-memory store attached to `globalThis` (so it
survives HMR in dev), seeded from `lib/seed.ts`. There is no real database
or third-party API integration in scope for the current milestones.

## PR-review-loop conventions

- Work happens in milestone-sized slices (see `TASKS.md` §5 for M1–M5 +
  stretch goals).
- Commit as you go; open a PR per slice rather than one giant PR at the end.
- Use the PR template in `TASKS.md` §8.
- Brief Claude Code in small slices and verify after each one — most bugs in
  this project only show up when you switch personas (organizer vs. member),
  so re-check both after every change.
