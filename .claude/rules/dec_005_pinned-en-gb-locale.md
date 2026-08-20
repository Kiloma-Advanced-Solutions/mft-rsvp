---
description: "Decision: date formatting is pinned to en-GB to stop server/client hydration drift."
---

# 005 — Date formatting pinned to `en-GB`

**Status:** settled.

## Context

`Intl.DateTimeFormat` with no locale argument uses the ambient locale. On the
server that is the machine's; in the browser it is the user's. When they differ,
the server HTML and the first client render disagree, and React reports a
hydration mismatch — a warning that is genuinely annoying to trace back to a
date.

## Decision

`lib/date.ts` pins `LOCALE = "en-GB"` and builds every formatter from it. All
date and time rendering goes through that module — `formatDayNumber`,
`formatMonthShort`, `formatWeekdayShort`, `formatDateLong`, `formatDateWithYear`,
`formatTime`, `formatTimeRange`, `formatDuration`, `formatRelativeDay`,
`daysUntil`, `isPast`, `toDayKey`, `toDateTimeLocalValue`,
`fromDateTimeLocalValue`.

## Rationale

One fixed locale makes server and client output identical by construction. The
alternative — passing a locale down from a request header — is real work for a
product that has one audience.

## Consequences

- Never call `new Intl.DateTimeFormat(...)` or `toLocaleDateString()` in a
  component. Add a helper to `lib/date.ts` instead.
- The `relative*` helpers and `isPast` read the clock, so they belong in a Server
  Component or an effect. Calling them during a client render can drift from what
  the server produced.
- `toDayKey()` deliberately builds its key from local `getFullYear/getMonth/
  getDate`, not `toISOString()` — the latter shifts into UTC and can move an
  evening event to the next day.
- Dates render as British format regardless of who is looking. Accepted.
