---
description: "Decision: CSS Modules with design tokens — no Tailwind, no CSS-in-JS, no component library."
---

# 001 — CSS Modules only

**Status:** settled, and not open for revisiting.

## Context

The project needs a visual language that works in light and dark, stays
consistent across screens built by different people, and does not require anyone
to pick colours while under time pressure.

## Decision

Styling is **CSS Modules** — one `.module.css` next to each component — drawing
every value from the tokens in `app/styles/tokens.css`.

Explicitly ruled out: **Tailwind, any CSS-in-JS library, and any component
library.** Also ruled out: hex codes and magic pixel values in components, and
additions to `app/globals.css`.

## Rationale

- Tokens make theming a property of the design system rather than a per-component
  concern: reference a token and both themes work with nothing to check.
- CSS Modules keep styles scoped without a runtime and without a build-time
  utility vocabulary to learn.
- A component library would have to be bent into this token system anyway, and
  the kit in `components/ui/` already covers what the product needs.
- Zero added dependencies (`dec_006`).

## Consequences

- Check `/styleguide` before writing CSS — the component probably exists.
- A new visual value means a new token, not a literal.
- The dark palette is duplicated in two selectors in `tokens.css`; both get
  edited together.
- Anyone reaching for `className="flex gap-2"` habits has to stop. There is no
  utility layer and none is coming.
