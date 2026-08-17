/**
 * Puts the seed data back without restarting the dev server.
 *
 * Handy after you have deleted half the board while testing:
 *
 *   curl -X POST http://localhost:3000/api/dev/reset
 *
 * Development only — it refuses to run in a production build.
 */

import { ApiError, jsonOk, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";

export const POST = withErrorHandling(async () => {
  if (process.env.NODE_ENV === "production") {
    throw ApiError.forbidden("Reset is only available in development.");
  }

  await db.reset();

  const [events, registrations] = await Promise.all([
    db.events.list(),
    db.registrations.list(),
  ]);

  return jsonOk({
    reset: true,
    events: events.length,
    registrations: registrations.length,
  });
});
