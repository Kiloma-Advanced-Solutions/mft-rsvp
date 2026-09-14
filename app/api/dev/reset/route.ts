/**
 * Restores the development fixtures -- or rather, it used to.
 *
 * This endpoint existed to rebuild the in-memory store without restarting the
 * dev server. Since the persistence swap there is no in-memory store to
 * rebuild: the application reads and writes SQL, and the fixtures are restored
 * from the command line instead.
 *
 *   EVENTS_DB_ALLOW_RESET=yes npm run db:reset
 *
 * So it refuses, and says that. The three alternatives were all worse. Doing
 * nothing and still answering `{ reset: true }` would make the endpoint lie.
 * Throwing would leave a generic 500 that tells a developer nothing. And having
 * it reseed the database over HTTP would put a destructive operation behind an
 * unauthenticated request, using guards designed for a CLI -- the reset command
 * requires an environment variable supplied at the moment of the reset for
 * exactly the reason that a web route cannot.
 *
 * Whether this endpoint should come back, and behind what, is a question with a
 * real answer that has not been designed yet. Until it is, refusing honestly is
 * the truthful thing for it to do.
 */

import { ApiError, withErrorHandling } from "@/lib/api";

export const POST = withErrorHandling(async () => {
  if (process.env.NODE_ENV === "production") {
    throw ApiError.forbidden("Reset is only available in development.");
  }

  throw new ApiError(
    501,
    "This endpoint no longer resets anything: the application now stores its " +
      "data in SQL Server, and these fixtures are restored from the command " +
      "line with `EVENTS_DB_ALLOW_RESET=yes npm run db:reset`.",
    { code: "not_implemented" },
  );
});
