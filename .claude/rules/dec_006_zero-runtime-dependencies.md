---
description: "Decision: the dependency list is next, react, react-dom — additions need a justification first."
---

# 006 — Zero runtime dependencies beyond the framework

**Status:** settled.

## Context

Every dependency is a thing to learn, a thing to keep current, and a thing that
brings its own opinions about styling or data fetching.

## Decision

`package.json` dependencies are exactly `next`, `react`, `react-dom`.
devDependencies are the type packages, `eslint`, `eslint-config-next` and
`typescript`. Nothing else.

If a dependency seems necessary, **say why and wait for an answer** before
installing it (`c_workflow.md`, rule 2). That includes date libraries,
class-name helpers, form libraries, state managers, UI kits and test runners.

## Rationale

The small utilities this project needs are small: `lib/cx.ts` is six lines and
replaces a class-name package; `lib/date.ts` replaces a date library and pins the
locale while it is at it (`dec_005`); `lib/api.ts` replaces a fetch wrapper and
gets consistent error shapes for free. Each one is less code than the dependency
it displaces, and each one is the place a project-specific rule lives.

## Consequences

- No Tailwind, no CSS-in-JS, no component library (`dec_001`).
- No test runner, and therefore no CI — verification is manual (`c_testing.md`).
- `package-lock.json` stays small and installs stay fast.
- Reach for a local helper in `lib/` before reaching for npm.
