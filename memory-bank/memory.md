# Memory bank index

Routing map: which file to read for which kind of question, and when to
update each one. `CLAUDE.md` at the repo root points here — this file is
the detailed version of that routing table.

| File | Holds | Read when... | Update when... |
|---|---|---|---|
| [a_architecture.md](a_architecture.md) | System boundaries, auth model, API responsibilities, build conventions, external systems, PR-review-loop conventions | You need to understand how the pieces fit together | The system's shape actually changes (new layer, new external dependency, auth model changes) |
| [c_conventions.md](c_conventions.md) | Durable git/style/process rules: branching, styling, components, data/permissions, API routes, copy, Next.js version-awareness, exploration rule, finishing checklist | Before writing code, to match house style | A rule changes or a new stable rule is agreed on — not for one-off exceptions |
| [s_state.md](s_state.md) | What's shipping, blocked, or in-flight right now | You need the current status of work | Every PR — this file goes stale fast, keep it honest |
| [dec_decisions.md](dec_decisions.md) | Append-only log of significant choices and their rationale | You're wondering "why is it built this way" | A new significant choice is made — append, never edit past entries |
| [r_references.md](r_references.md) | Pointers to external truth: GitHub, brand assets, PR history, brief | You need a link, not a copy, of something external | A new external resource becomes relevant |
| [u_user.md](u_user.md) | Operator profile, preferences, machine setup | You need to tailor behavior to how Yaniv works | Preferences or machine setup change |

## Not sure where something goes?

- Is it about the *system*? → `a_architecture.md`.
- Is it a *rule* that should hold going forward? → `c_conventions.md`.
- Is it *true today but will be false next week*? → `s_state.md`.
- Is it *why* something was chosen? → `dec_decisions.md`.
- Is it a *link* to somewhere else? → `r_references.md`.
- Is it about *Yaniv*, not the code? → `u_user.md`.
