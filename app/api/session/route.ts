/**
 * Session — the worked example of this project's API conventions.
 *
 * Read it before writing `/api/events`. It shows the house style end to end:
 * `withErrorHandling` around every export, `readJson` for the body, `ApiError`
 * for anything the caller did wrong, and a plain object for success.
 *
 *   GET  /api/session   -> { currentUser, users }
 *   POST /api/session   -> { currentUser }        body: { userId: string }
 */

import { ApiError, jsonOk, readJson, withErrorHandling } from "@/lib/api";
import { db } from "@/lib/db";
import { API_ERRORS, noSuchPersonaLabel } from "@/lib/labels";
import { getCurrentUser, setCurrentUser } from "@/lib/session";

export const GET = withErrorHandling(async () => {
  const [currentUser, users] = await Promise.all([
    getCurrentUser(),
    db.users.list(),
  ]);

  return jsonOk({ currentUser, users });
});

export const POST = withErrorHandling(async (request: Request) => {
  const body = await readJson<{ userId?: unknown }>(request);

  if (typeof body.userId !== "string" || body.userId.length === 0) {
    throw ApiError.badRequest(API_ERRORS.missingUserId);
  }

  const user = await db.users.get(body.userId);
  if (!user) {
    throw ApiError.notFound(noSuchPersonaLabel(body.userId));
  }

  await setCurrentUser(user.id);

  return jsonOk({ currentUser: user });
});
