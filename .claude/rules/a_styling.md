---
description: Design tokens, CSS Modules, and how both themes stay working.
paths:
  - "app/styles/**"
  - "app/globals.css"
  - "**/*.module.css"
---

# Styling

CSS Modules only — see `dec_001_css-modules-only.md`.

## Tokens are the only source of visual values

Every colour, space, radius, shadow, font size, weight, transition and layout
dimension comes from a token in `app/styles/tokens.css`. **No hex codes and no
magic pixel values in components.** If you need a value that does not exist, add
a token rather than a literal, so light and dark stay in sync.

What is available:

- Surfaces and text — `--color-bg`, `--color-bg-subtle`, `--color-surface`,
  `--color-surface-subtle`, `--color-surface-hover`, `--color-overlay`,
  `--color-border`, `--color-border-strong`, `--color-text`,
  `--color-text-muted`, `--color-text-subtle`, `--color-text-inverse`
- Brand and semantic — `--color-primary*`, `--color-success*`, `--color-warning*`,
  `--color-danger*`, `--color-info*`, `--color-neutral-*`, each with a `-soft`
  background and a `-text` foreground variant
- Event accents — `--accent-violet|blue|emerald|amber|rose|cyan`, keyed by each
  event's `accent` field (`AccentKey` in `lib/types.ts`)
- `--color-focus-ring`, `--shadow-sm|md|lg`
- Spacing on a 4px scale — `--space-1|2|3|4|5|6|8|10|12|16`
- `--radius-sm|md|lg|xl|full`
- Type — `--font-sans`, `--font-mono`, `--text-xs` … `--text-3xl`,
  `--leading-tight|snug|normal`, `--weight-normal|medium|semibold|bold`,
  `--tracking-tight|wide`
- `--transition-fast|base`, `--layout-max`, `--layout-gutter`, `--topbar-height`

## One module per component

A `.module.css` sits next to each component. **Nothing new goes in
`app/globals.css`** — that file is the reset and base elements only, and it is
finished.

## Both themes

Light is the base. The dark palette applies by system preference unless the
document sets `data-theme="light"`, and always when it sets `data-theme="dark"`.
A theme toggle would therefore be one attribute on `<html>` and no component
changes.

The dark block is duplicated literally in two selectors — a `@media
(prefers-color-scheme: dark)` rule and `:root[data-theme="dark"]` — because CSS
has no mixin. **Edit both when you change a colour.**

If you only ever reference tokens, both themes work for free and there is
nothing to check. If you write a literal colour, you have broken one of them.
