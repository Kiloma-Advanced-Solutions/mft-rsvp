---
description: Pointers to things that live outside this repo. Links and one-liners only.
---

# References

Links out. Nothing here is mirrored — follow the link for the content.

## Repository

- <https://github.com/Kiloma-Advanced-Solutions/mft-rsvp> — the repo. Default
  branch and PR target: `master`.
- <https://github.com/Kiloma-Advanced-Solutions/mft-rsvp/pulls> — open PRs.

## Pull request history

- [#1](https://github.com/Kiloma-Advanced-Solutions/mft-rsvp/pull/1) — Events
  Board workshop skeleton and brief. **Merged**; it is what `master` is.
- [#2](https://github.com/Kiloma-Advanced-Solutions/mft-rsvp/pull/2) — Alona's
  branch. Open.
- [#3](https://github.com/Kiloma-Advanced-Solutions/mft-rsvp/pull/3) — M1: the
  events board (`eylon/events-board`). Open.
- [#4](https://github.com/Kiloma-Advanced-Solutions/mft-rsvp/pull/4) — M1 board
  filtering and visibility (`michal-bucks-events-board`). Open.

Other remote branches carrying M1 attempts: `alona-branch`, `yaniv-branch`,
`michal-bucks-events-board`. `shani-events-board` carries the briefs only.

## In-repo documents that are the source of truth

- `TASKS.md` — the specification. §4 is the authoritative visibility and
  permission tables; §6 the edge cases; §8 the PR template.
- `docs/BRIEF-M1-board.md` — the agreed brief for the `/events` board.
- `docs/KAS-WS-0014-01-Events-Board-Workshop-Brief.pdf` — the Kiloma-branded
  workshop brief.
- `README.md` — how to run it, and the file map.
- `AGENTS.md` — the warning that this Next.js version diverges from training
  data, and where its docs live (`node_modules/next/dist/docs/`).

## Local

- <http://localhost:3000> — dev server. `/styleguide` renders the whole UI kit
  with real data; look there before writing CSS.
- No deploy target and no CI are configured in this repo.
