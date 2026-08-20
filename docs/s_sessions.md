# s_ — Sessions

The working log. Each session: what we set out to build, the plan we agreed,
the tasks it broke into, what actually got done, what did not, and the PR.

Newest session at the top. Update this **during** the session, not from memory
afterwards.

---

## Status at a glance

| Milestone | Brief says | State |
| --- | --- | --- |
| **M1** — the board `/events` | must | ✅ Done — session 2 |
| **M2** — the detail screen `/events/[id]` | must | ⬜ Not started. Still the stub, and it renders **any** event with no visibility check |
| **M3** — register and respond (API) | must | ⬜ Not started |
| **M4** — create and edit in place | should | ⬜ Not started |
| **M5** — the approval queue | should | ⬜ Not started |
| Stretch — calendar, waitlist, invitations, search, my events, optimistic UI, theme toggle | — | ⬜ None started |

**The single most important open item:** `app/events/[id]/page.tsx` calls
`db.events.get(id)` and renders whatever it finds. An invite-only event is
currently reachable by URL by anyone who guesses the id. That is the first
thing M2 fixes.

---

## Session template

Copy this block for each new session.

```markdown
## Session N — <title> · <YYYY-MM-DD>

**Goal.** One or two sentences. What we want to be true at the end.

**Plan.**
1. …
2. …

**Tasks**
| # | Task | Commit | State |
| --- | --- | --- | --- |
| N.1 | | | ⬜ / 🔄 / ✅ |

**Done.**

**Not done, and why.**

**Decisions taken** → recorded as D-nn in `dec_decisions.md`.

**PR.** #n — <title> — open / merged.

**Next session starts with.**
```

**End-of-session checklist**

- [ ] `npm run typecheck && npm run lint && npm run build` clean
- [ ] Clicked through as one organizer and one member
- [ ] Every task above marked ✅ / ⬜ honestly
- [ ] New decisions written into `dec_decisions.md`
- [ ] New files added to `f_files.md`
- [ ] Links that helped added to `r_references.md`
- [ ] PR opened, and its number recorded here

---

## Session 3 — Memory bank · 2026-08-20

**Goal.** Give the project a written memory so the next session does not start
by re-reading the whole codebase: architecture, conventions, terminology,
decisions, session log, references, environment, and a file-by-file map.

**Plan.**
1. Branch `alona/memory-bank` off the current work.
2. Read the whole repo — every `lib/` module, every route, the component
   inventory, the config and the git history.
3. Write eight documents into `docs/`, one per prefix, plus an index.
4. Reconstruct sessions 1 and 2 from the git history rather than inventing
   them.

**Tasks**

| # | Task | State |
| --- | --- | --- |
| 3.1 | Create branch `alona/memory-bank` | ✅ |
| 3.2 | `docs/README.md` — index of the memory bank | ✅ |
| 3.3 | `docs/a_architecture.md` | ✅ |
| 3.4 | `docs/c_conventions.md` | ✅ |
| 3.5 | `docs/d_terminology.md` | ✅ |
| 3.6 | `docs/dec_decisions.md` | ✅ |
| 3.7 | `docs/s_sessions.md` | ✅ |
| 3.8 | `docs/r_references.md` | ✅ |
| 3.9 | `docs/u_user-setup.md` | ✅ |
| 3.10 | `docs/f_files.md` — file-by-file map | ✅ |

**Done.** All eight documents plus the index. No application code touched.

**Not done, and why.** No product code — this session is documentation only, on
purpose, so the diff is reviewable as one thing.

**Decisions taken.** D-15 in `dec_decisions.md`. Sessions 1 and 2 below were
reconstructed from `git log` and the diff of `aaea77c`, so the *reasons*
recorded for them are inferred from the code and its comments rather than
transcribed from the session itself.

**PR.** Not opened yet.

**Next session starts with.** M2 — the detail screen, beginning with the
visibility check.

---

## Session 2 — The board · 2026-08-17

Reconstructed from commits `d0090ce` and `aaea77c`.

**Goal.** M1 — `/events` shows the events this person is allowed to see, with
filters, sorted, split into upcoming and past, with a real empty state.

**Tasks**

| # | Task | Commit | State |
| --- | --- | --- | --- |
| 2.1 | Update `package-lock.json` | `d0090ce` | ✅ |
| 2.2 | `lib/permissions.ts` — `isHost`, `isInvited`, `canViewEvent`, `canManageEvent` | `aaea77c` | ✅ |
| 2.3 | `lib/events.ts` — `getBoard`, `toBoardEvent`, `splitByTime`, `countByAccess` | `aaea77c` | ✅ |
| 2.4 | `lib/board-filters.ts` — the URL contract for filters | `aaea77c` | ✅ |
| 2.5 | `components/events/EventFilters.tsx` + module CSS | `aaea77c` | ✅ |
| 2.6 | `app/events/page.tsx` — the board, using `EventCard` in `EventGrid` | `aaea77c` | ✅ |
| 2.7 | `BOARD_LABELS` added to `lib/labels.ts` | `aaea77c` | ✅ |

**Done.** M1, all of it. 629 insertions across 8 files, in one commit.

Acceptance from the brief — *switching from Maya to Priya removes the two
invite-only events from the board and the count changes* — is satisfied by
`getBoard()` running `canViewEvent()` before anything is rendered.

**Not done.** M2–M5 and every stretch goal.

**Decisions taken** → D-09 to D-14 in `dec_decisions.md`.

**Retrospective note.** The whole milestone landed as a single commit. The
convention in `c_conventions.md` asks for a commit per small task — permissions,
service layer, filters, page would have been four readable commits, and the
history is read as part of the review.

**PR.** None. The work sits on the branch.

---

## Session 1 — The skeleton · 2026-08-17

Not our work — the workshop starting point, by `EkingIsrael`.

| Commit | What |
| --- | --- |
| `18e6767` | Initial commit from Create Next App |
| `6ab143b` | Add Events Board workshop skeleton — tokens, UI kit, event components, layout, `lib/` (types, db, seed, session, api, labels, date, cx), `/`, `/styleguide`, `/api/session`, `/api/dev/reset`, `TASKS.md`, `CLAUDE.md` |
| `27ab7be` | Add the Kiloma-branded PDF of the workshop brief |
| `f9bfc43` | Merge PR #1 |

Everything that is not the product was done here: the design system, the UI
kit, the data layer, the session and the API conventions. The brief is explicit
that none of it should be rebuilt.

---

## Branches on the remote

Other people's runs at the same workshop, useful to compare against:
`eylon/events-board`, `peleg/events-board`, `shani-events-board`,
`michal-bucks`, `michal-bucks-events-board`, `yaniv-branch`,
`alona-branch`.
