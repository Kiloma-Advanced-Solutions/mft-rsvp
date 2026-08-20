---
description: App Router layout, the server/client boundary, and which routes exist today.
paths:
  - "app/**"
---

# App structure

Next.js App Router. **This is not the Next.js you may remember** — read the
guide in `node_modules/next/dist/docs/` before writing routing code, per
`AGENTS.md`.

## The routes that exist

| Route | State |
| --- | --- |
| `app/page.tsx` | Built. The start page: what is done, what is not, the five personas. |
| `app/events/page.tsx` | **Stub.** Renders an `EmptyState` explaining that the board is unbuilt. |
| `app/events/[id]/page.tsx` | **Stub.** Renders any event it finds, with no visibility check. |
| `app/styleguide/` | Built. Every component in the kit, with real data. |
| `app/api/session/route.ts` | Built. Persona switching, and the API house style to copy. |
| `app/api/dev/reset/route.ts` | Built. Refuses to run in production. |
| `app/not-found.tsx` | Built. |
| `app/layout.tsx` | Built. Fonts, metadata template, `ToastProvider` + `AppShell`. |

Nothing under `/api/events` exists yet.

## Server Components by default

Pages are async Server Components that read the store directly:

```tsx
export default async function BoardPage() {
  const events = await db.events.list();
```

Add `"use client"` only at the leaf that actually needs state, an effect or an
event handler — never at the top of a page. Today exactly three components are
client components: `NavLink` (reads the pathname), `PersonaSwitcher` (menu state
+ fetch), and `Toast` (context + timers).

`app/layout.tsx` shows why wrapping the app in a Client Component is safe:
`children` is rendered on the server and handed to `ToastProvider` as a prop, so
no page is turned into a client component by it.

## Page conventions

- Export a `metadata` object with a `title`; the root layout templates it as
  `"%s · Events Board"`.
- Open with a `PageHeader` — page-level actions go in its `actions` slot,
  back-links in `backHref`/`backLabel`.
- Typed route helpers come from `next typegen`: `PageProps<"/events/[id]">`,
  `LayoutProps<"/">`. `params` is a promise — `const { id } = await params;`.
- An event the viewer may not see calls `notFound()`. Never 403.
- Page-level layout CSS is a `.module.css` next to the page
  (`app/page.module.css` is the pattern).

## Imports

`@/*` maps to the repo root: `@/lib/db`, `@/components/ui`. Import the UI kit
from the barrel `@/components/ui`, not from individual files.
