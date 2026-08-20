---
description: "Decision: no authentication — a persona cookie read on the server stands in for login."
---

# 004 — Persona cookie instead of authentication

**Status:** settled.

## Context

The product is about *authorisation* — three access modes, three roles, a
visibility table. A login screen exercises none of that, and building one would
cost time that belongs to the rules.

## Decision

There is no authentication. You "sign in" by choosing one of five personas from
the switcher in the top bar, which `POST`s to `/api/session` and sets the
`eb_persona` cookie (httpOnly, sameSite lax, 30 days). The server reads it on
every request through `getCurrentUser()`.

`getCurrentUser()` is the **only** source of identity on the server. It falls
back to the default persona when the cookie is missing or points at a user who
no longer exists, so it never returns null and no caller handles a logged-out
state.

## Rationale

- Switching persona re-renders the whole app as that person, which makes the
  visibility rules checkable in two clicks — the fastest possible feedback loop
  for the thing being graded.
- Keeping identity server-side, from a cookie, means the trust model is the same
  one a real app would have, even though the login is fake.

## Consequences

- **Never trust a `userId` from a request body.** The client sending its own
  identity and the server believing it is one of the named failure modes in
  `TASKS.md` §6.
- `setCurrentUser()` can only be called from a Route Handler or Server Function,
  because cookies cannot be written from a page or layout.
- After switching, the client calls `router.refresh()`; without it the page keeps
  rendering the previous persona's view.
- Verification means clicking through as more than one persona, every time — see
  `c_testing.md`.
