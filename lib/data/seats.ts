/**
 * The two writes that can hand out a seat, made safe against each other.
 * SERVER ONLY -- it reaches `client.ts`.
 *
 * Everything else in `lib/data/` is persistence: a statement, its parameters,
 * and the row it returns. This module is the exception, and it exists because
 * one invariant cannot be expressed as a constraint:
 *
 *     the number of `going` registrations never exceeds the event's capacity
 *
 * A CHECK constraint cannot say that -- it spans rows, and two tables -- so it
 * can only be a transaction protocol. This is that protocol, in one file, so
 * there is one place to read and one place to get it wrong.
 *
 * THE PROTOCOL. Every write that can raise the `going` count does this, in this
 * order, inside one transaction:
 *
 *   1. take the event row with `WITH (UPDLOCK, ROWLOCK)` -- the mutex;
 *   2. read the event's facts, the `going` count and the registration row,
 *      all under that lock;
 *   3. re-run the SAME pure rule from `lib/permissions.ts` the route ran, now
 *      against facts that cannot change underneath it;
 *   4. write, with the row's expected status as a predicate;
 *   5. commit, which is what releases the lock.
 *
 * Step 3 is deliberate: the capacity rule is not restated here, and it is not
 * restated in T-SQL either. `getRegistrationAvailability` and
 * `getRequestDecisionAvailability` are pure, synchronous and store-free, so the
 * transaction can call exactly what the route called. One implementation of the
 * rules, checked twice -- once for the answer the caller sees, once for the
 * answer that is true.
 *
 * WHY THE LOCK IS ENOUGH. An update lock is held until the transaction commits
 * and no second transaction can hold one on the same row, so the count read at
 * step 2 cannot change before the write at step 4. It is not a range lock and
 * does not need to be: a phantom `going` row could only be written by another
 * seat claim, and that claim must take this same lock first. **The guarantee is
 * the protocol, not the lock's own scope.**
 *
 * WHICH IS TO SAY: a future write path that sets `Status = N'going'` without
 * coming through here silently breaks the invariant, and nothing in the
 * database will stop it. If you are about to add one, add it to this file
 * instead.
 *
 * One half of that is no longer only a warning. `db.registrations.update` takes
 * `RegistrationUpdate`, which does not admit `going` -- so the store's generic
 * write cannot grant a place, and this module keeps the full
 * `RegistrationPatch` because granting one is what it is for. What no type can
 * check is a *new* statement written under `lib/data/`: `updateRegistrationOn`
 * still takes the wide patch, as it must, so anything calling it from outside
 * this file is back to being a comment's problem.
 *
 * What is deliberately NOT here, because none of it can raise the count:
 * withdrawing, rejecting, and requesting a place on an approval event. Those
 * are ordinary single-statement writes, made safe by the expected-status
 * predicate in `registrations.ts` alone.
 *
 * Written to the SQL Server 2008 R2 feature floor and statically enforced;
 * runtime execution has been verified against Azure SQL DEV only.
 */

import { getPool, inTransaction } from "./client";
import { isDuplicateKey } from "./errors";
import { readEventForUpdate } from "./events";
import {
  countGoing,
  createRegistrationOn,
  readRegistrationById,
  readRegistrationForUser,
  updateRegistrationOn,
} from "./registrations";
import {
  getRegistrationAvailability,
  getRequestDecisionAvailability,
  requestCanBeApproved,
} from "../permissions";
import type {
  Registration,
  RegistrationAvailability,
  RequestDecisionAvailability,
  User,
} from "../types";

/**
 * What happened to an attempt to take a place.
 *
 * A union rather than a nullable row, because the four failures mean four
 * different things to a caller and flattening them would make a route guess.
 * `refused` carries the availability the rule produced under the lock, so the
 * route can word the refusal with the same helper it uses for a refusal it
 * detected itself -- a caller that loses a race gets exactly the message it
 * would have got by arriving a moment later.
 */
export type SeatClaim =
  | { outcome: "claimed"; registration: Registration }
  | { outcome: "refused"; availability: RegistrationAvailability }
  | { outcome: "duplicate" }
  | { outcome: "stale" }
  | { outcome: "gone" };

/** The same, for a host's approval. */
export type SeatApproval =
  | { outcome: "approved"; registration: Registration }
  | { outcome: "refused"; availability: RequestDecisionAvailability }
  | { outcome: "not_found" }
  | { outcome: "stale" }
  | { outcome: "gone" };

/**
 * Register, or request a place, atomically.
 *
 * The lock is taken for both, and unconditionally. Requesting a place on an
 * `approval` event produces a `pending` row and cannot fill the event, so it
 * does not strictly need the mutex -- but deciding that requires reading the
 * event's access mode, and reading it before the lock is its own small race.
 * One uncontended row lock is cheaper than that distinction is worth.
 *
 * `newId` and `now` are supplied by `lib/db.ts`, which owns every id and every
 * timestamp in this application. They are generated before the transaction and
 * used only if a row is actually inserted; a UUID that goes unused costs
 * nothing and keeps the generator in one place.
 */
export async function claimSeat({
  eventId,
  viewer,
  newId,
  now,
}: {
  eventId: string;
  viewer: User;
  newId: string;
  now: string;
}): Promise<SeatClaim> {
  const pool = await getPool();

  try {
    return await inTransaction(pool, async (transaction): Promise<SeatClaim> => {
      // 1 + 2 -- the mutex, then the facts, all inside it.
      const event = await readEventForUpdate(transaction, eventId);
      if (!event) return { outcome: "gone" };

      const goingCount = await countGoing(transaction, eventId);
      const existing = await readRegistrationForUser(
        transaction,
        eventId,
        viewer.id,
      );

      // 3 -- the same rule the route ran, on facts that cannot now move.
      const availability = getRegistrationAvailability(event, viewer, {
        goingCount,
        viewerRegistration: existing,
      });

      if (availability.state !== "open") {
        return { outcome: "refused", availability };
      }

      const status = availability.action === "request" ? "pending" : "going";

      // 4 -- the write.
      if (existing) {
        const revived = await updateRegistrationOn(
          transaction,
          existing.id,
          {
            status,
            // A revived row starts a new cycle and carries nothing from the
            // last one -- the same three fields the route cleared before
            // Slice 8, for the same reason.
            message: undefined,
            decidedBy: undefined,
            decidedAt: undefined,
          },
          now,
          // Compare-and-set against the status read under the lock. Withdrawing
          // does not take the mutex, so this row can still have moved.
          existing.status,
        );

        return revived === null
          ? { outcome: "stale" }
          : { outcome: "claimed", registration: revived };
      }

      const record: Registration = {
        id: newId,
        eventId,
        userId: viewer.id,
        status,
        createdAt: now,
        updatedAt: now,
      };

      await createRegistrationOn(transaction, record);

      // The record as written. `datetime2(3)` is exactly millisecond precision,
      // so re-reading it would return these same values at the cost of a round
      // trip -- the same reasoning `lib/db.ts` applies to a created event.
      return { outcome: "claimed", registration: record };
    });
  } catch (error) {
    // `UQ_Events_Registrations_Event_User` rejecting a second row for this
    // person. Under the lock this should be unreachable, but the constraint is
    // the real guarantee of one-row-per-person and this is what keeps its
    // enforcement from surfacing as a 500.
    //
    // It is the only error translated here. Anything else -- a deadlock
    // included -- is a failure rather than an outcome, and goes up to
    // `withErrorHandling` to be logged.
    if (isDuplicateKey(error)) return { outcome: "duplicate" };
    throw error;
  }
}

/**
 * Approve a request, atomically.
 *
 * Approving is a seat claim performed by a host: `pending -> going` and
 * `rejected -> going` both raise the count, so both take the same mutex and
 * re-run the same rule. Rejecting does not, and is not here.
 *
 * `decidedBy` and `now` become the decision stamp. `message` is deliberately
 * left alone -- it is what the person wrote for this cycle, and it stays the
 * record of why the host said yes.
 */
export async function approveRequest({
  eventId,
  registrationId,
  decidedBy,
  now,
}: {
  eventId: string;
  registrationId: string;
  decidedBy: string;
  now: string;
}): Promise<SeatApproval> {
  const pool = await getPool();

  // No error translation here: approving only ever updates an existing row, so
  // it cannot violate a unique constraint, and everything else the driver may
  // throw is a failure rather than an outcome.
  return inTransaction(
    pool,
    async (transaction): Promise<SeatApproval> => {
      const event = await readEventForUpdate(transaction, eventId);
      if (!event) return { outcome: "gone" };

      const goingCount = await countGoing(transaction, eventId);
      const registration = await readRegistrationById(
        transaction,
        registrationId,
      );

      // A row that is not this event's is not this host's to decide, and
      // answers the same 404 as a row that does not exist -- so a host of one
      // event learns nothing about another's.
      if (!registration || registration.eventId !== eventId) {
        return { outcome: "not_found" };
      }

      const availability = getRequestDecisionAvailability(event, {
        goingCount,
        registration,
      });

      if (!requestCanBeApproved(availability)) {
        return { outcome: "refused", availability };
      }

      const decided = await updateRegistrationOn(
        transaction,
        registration.id,
        { status: "going", decidedBy, decidedAt: now },
        now,
        // The status this decision was made against. A second host approving,
        // or a rejection landing first, moves the row and this affects
        // nothing.
        registration.status,
      );

      return decided === null
        ? { outcome: "stale" }
        : { outcome: "approved", registration: decided };
    },
  );
}
