@AGENTS.md

# Events Board — project conventions

The brief is in `TASKS.md`. This file is the house style: how code in this repo
is written, so you do not have to say it again in every prompt.

## Stack

Next.js App Router, React, TypeScript, **CSS Modules**. No Tailwind, no CSS-in-JS,
no component library. If a dependency seems necessary, say why before adding it.

## Styling

- Every colour, space, radius, shadow and font size comes from a token in
  `app/styles/tokens.css`. No hex codes and no magic pixel values in components.
- One `.module.css` next to each component. Nothing new goes in `app/globals.css`.
- Check `/styleguide` before building a new component — it probably exists.
- Both themes have to work. Tokens handle that automatically if you use them.

## Components

- `components/ui/` — generic primitives that know nothing about events.
- `components/events/` — anything that understands the domain.
- `components/layout/` — the app frame.
- Server Components by default. Add `"use client"` only at the leaf that actually
  needs state, an effect or an event handler — not at the top of a page.
- Props are explicit. No prop spreading through several layers.

## Data and permissions

- `lib/db.ts` and `lib/seed.ts` are **server only**. A Client Component that
  needs data calls an API route.
- `getCurrentUser()` from `lib/session.ts` is the only source of identity on the
  server. Never take a `userId` from a request body and trust it.
- Every rule in section 4 of `TASKS.md` is enforced in the route handler.
  Hiding a button is a UX affordance, not a permission check.
- Answer "can this person see this event" and "can this person manage this event"
  in one shared place, and call it from both the pages and the API.

## API routes

Follow `app/api/session/route.ts`. Every handler is wrapped in
`withErrorHandling`; bodies are read with `readJson`; anything the caller got
wrong is thrown as an `ApiError`; success returns a plain object. Client code
calls `fetchJson` from `lib/api.ts`, which unwraps the payload and throws the
server's message on failure.

Route handlers, not Server Actions — that is the convention here, so the
authorisation boundary is a single obvious layer.

## Copy

User-facing words live in `lib/labels.ts`. Import them rather than typing
strings into JSX, so the board and the detail page never disagree about what to
call a pending request.

## Before you say you are done

```bash
npm run typecheck && npm run lint && npm run build
```

Then click through the app as at least two personas — one organizer and one
member. Most of the bugs in this project are visible only when you switch.
