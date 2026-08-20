---
description: There is no test runner — verification is switching personas by hand, plus curl for the API.
---

# Verification

**There is no test runner, no test files, and no CI in this project.** Do not add
one without asking (`dec_006`). Verification is manual, and it is not optional:
most of the bugs in this project are visible only when you switch persona.

## The loop

```bash
npm run dev
```

Open <http://localhost:3000>, then switch persona from the top right. That sets
the `eb_persona` cookie and re-runs every Server Component as that person.

```bash
curl -X POST http://localhost:3000/api/dev/reset
```

Restores the fixtures without a restart — use it after deleting half the board
while testing.

## Verify as at least two personas, always

One organizer and one member, minimum. The five personas exist because each one
proves something different — see `d_glossary.md` for the table. The headline
check for any visibility work: switching **Maya → Priya** removes the two
invite-only events, and the count changes.

## Check the payload, not the page

A visibility rule is only verified if the data never reached the browser. View
source or read the network response and confirm the event title is **absent** —
not present-but-hidden. `TASKS.md` §6 lists the traps worth checking:

- the API returning invite-only events to people not invited;
- authorisation checked in the component but not in the route handler;
- the client sending its own `userId` and the server believing it;
- capacity counting `pending` or `cancelled` rows;
- registration open on a past, draft or cancelled event;
- a host approving a request that would push past capacity;
- dates formatted differently on server and client (hydration warnings).

## Also check

- The browser console is clean — in particular no hydration warnings.
- Light and dark both work (free if you only used tokens).
- Narrow the window: nothing overflows.
- API rules hold under `curl`, not just in the UI. Assume the client lies:
  registering for an invite-only event you were not invited to must fail on the
  server with a sensible status.
