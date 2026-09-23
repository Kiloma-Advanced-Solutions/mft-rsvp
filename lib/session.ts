/**
 * Who is using the app right now. SERVER ONLY.
 *
 * There is no real authentication here and there should not be — the exercise
 * is about authorisation rules, not about login screens. You "sign in" by
 * picking a persona from the switcher in the top bar, which writes a cookie.
 *
 * Treat `getCurrentUser()` as the trusted source of identity on the server.
 * Never let the client tell an API route who it is via the request body.
 */

import { cookies } from "next/headers";

import { db } from "./db";
import { DEFAULT_USER_ID, PERSONA_ORDER } from "./seed";
import type { User } from "./types";

export const SESSION_COOKIE = "eb_persona";

/**
 * The signed-in persona. Falls back to the default when the cookie is missing
 * or points at a user who no longer exists, so this never returns null and
 * callers never have to handle a logged-out state.
 */
export async function getCurrentUser(): Promise<User> {
  const cookieStore = await cookies();
  const id = cookieStore.get(SESSION_COOKIE)?.value;

  const user = id ? await db.users.get(id) : null;
  if (user) return user;

  const fallback = await db.users.get(DEFAULT_USER_ID);
  if (!fallback) {
    throw new Error(
      `Seed data is missing the default persona "${DEFAULT_USER_ID}".`,
    );
  }
  return fallback;
}

/**
 * The personas on offer, in the order the switcher should show them.
 *
 * A separate question from `db.users.list()`, which stays a general-purpose read
 * with no opinion about presentation. Where a user row sits in a list is not a
 * fact about the row, so the order is `PERSONA_ORDER` in `lib/seed.ts` and lives
 * here rather than in the store: this module is what owns the persona idea, and
 * a switcher order is not something a database should be asked to remember.
 *
 * It orders the seeded personas and then appends anybody else, so a user who is
 * not a fixture is listed rather than hidden -- the switcher is how visibility
 * rules get checked, and a persona missing from it would be a rule nobody can
 * test. Callers are Server Components; `PersonaSwitcher` is handed the result
 * and renders it as given.
 */
export async function listPersonas(): Promise<User[]> {
  const users = await db.users.list();
  const rank = new Map(PERSONA_ORDER.map((id, index) => [id, index]));
  const rankOf = (user: User) => rank.get(user.id) ?? PERSONA_ORDER.length;

  // `sort` is stable, so anyone off the list lands after the personas in
  // whatever order the store gave -- deterministic without a second key.
  return [...users].sort((a, b) => rankOf(a) - rankOf(b));
}

/**
 * Switch persona. Cookies can only be written from a Route Handler or a Server
 * Function, so this cannot be called from a page or layout.
 */
export async function setCurrentUser(userId: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, userId, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
  });
}
