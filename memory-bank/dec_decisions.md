# Decisions

Append-only log of significant choices and their rationale. Add a new entry
below the last one — never edit or delete a past entry, even if it's later
reversed (add a new entry that supersedes it instead, and link back with
`[[dec_decisions]]` context in prose if useful).

Entries below are backfilled from the state of the repo/docs as of this
writing (2026-08-20); they weren't logged at the time they were made, so
dates are approximate ("pre-existing").

---

**Pre-existing — CSS Modules over Tailwind/CSS-in-JS.**
No extra dependency needed; `app/styles/tokens.css` already centralizes
theming, so a utility framework or CSS-in-JS layer wouldn't add much. See
[c_conventions.md](c_conventions.md#styling-rules).

**Pre-existing — Route handlers over Server Actions.**
Keeps the authorization boundary in one obvious, testable layer
(`app/api/*`) rather than spread across inline server functions. See
[a_architecture.md](a_architecture.md#api-responsibilities).

**Pre-existing — Tokens-only styling, no hex/magic values in components.**
Guarantees light/dark themes stay in sync automatically — a component that
never hardcodes a value can't drift from the token system.

**Pre-existing — `lib/db.ts` / `lib/session.ts` are server-only; Client
Components must go through an API route.**
Prevents a Client Component from ever trusting a client-supplied identity
or touching the store directly.

**Pre-existing — Centralized copy in `lib/labels.ts`.**
Keeps the board and detail page from disagreeing about what to call the
same state (e.g. a pending request).

**Pre-existing — Shared visibility/permission helper (`lib/visibility.ts`).**
One place answers "can see" / "can manage" so pages and API routes can't
silently diverge on authorization logic.

**Pre-existing — In-memory `globalThis`-backed DB for dev, no real database.**
Sufficient for the workshop's scope (M1–M5); avoids the setup cost of a real
database for a project that doesn't need persistence across restarts yet.

**Pre-existing — Cookie-based persona switching instead of real auth.**
Lets you demo all five personas instantly via `PersonaSwitcher` without
building a login flow; `getCurrentUser()` is written so a real auth system
could replace the cookie read later without touching call sites.
