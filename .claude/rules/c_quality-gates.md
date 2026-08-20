---
description: The checks that must pass, and the code standards they do not catch.
paths:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.mts"
---

# Quality gates

## Run all three before saying it is done

```bash
npm run typecheck && npm run lint && npm run build
```

- `typecheck` is `next typegen && tsc --noEmit` — the typegen step is what makes
  `PageProps<"/events/[id]">` and `LayoutProps<"/">` resolve, so running `tsc`
  alone can fail for the wrong reason.
- `lint` is ESLint 9 flat config: `eslint-config-next/core-web-vitals` +
  `eslint-config-next/typescript`, with the default ignores restated in
  `eslint.config.mjs`.
- `build` catches server/client boundary violations that neither of the others
  will — importing `lib/db.ts` from a Client Component, for instance.

There is no CI. These commands are the whole safety net, so they get run
locally, and "it typechecks" is not a substitute for the other two.

## Standards the tooling does not enforce

- **No `any`.** Narrow `unknown` explicitly instead.
- No unused exports. No commented-out code.
- TypeScript is `strict`. Do not widen types or reach for a cast to get past an
  error — the error is usually correct.
- No new dependencies (`dec_006`).
- Imports are grouped: external packages, then `@/` absolute imports, then
  relative ones, then the style module last. Existing files all follow this.
- Comments explain *why*, in the voice of the ones already there — the existing
  files carry a short header comment saying what the module is for and what the
  trap is. Match that density; do not narrate the obvious.

## Formatting

There is no Prettier config and no format script. Match the surrounding file:
two-space indent, double quotes, semicolons, trailing commas in multi-line
literals, ~80 column comments.
