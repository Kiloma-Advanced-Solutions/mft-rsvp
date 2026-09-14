/**
 * User reads. SERVER ONLY -- it reaches `client.ts`, which is `server-only`.
 *
 * Read-only on purpose: the product has no user write path. There is no
 * create, update or delete here because there is none in `lib/db.ts` either,
 * and inventing them would be new API rather than a persistence swap.
 */

import sql from "mssql";

import { getPool } from "./client";
import { isUuid, toUser, type UserRow } from "./rows";
import type { User } from "../types";

/**
 * Deterministic, and deliberately not persona order.
 *
 * `PERSONA_ORDER` in `lib/seed.ts` is display order, applied by
 * `listPersonas()` in `lib/session.ts`; where a row sits in a list is not a
 * fact about the row. This stays a general-purpose read, so it only needs an
 * order that never changes between calls -- SQL guarantees none without
 * `ORDER BY`, whatever a clustered index might suggest.
 */
const SELECT_USERS = `
SELECT Id, Name, Email, Title, Role, Initials, Accent
FROM   dbo.Events_Users
ORDER  BY Name ASC, Id ASC;
`;

const SELECT_USER = `
SELECT Id, Name, Email, Title, Role, Initials, Accent
FROM   dbo.Events_Users
WHERE  Id = @id;
`;

export async function listUsers(): Promise<User[]> {
  const pool = await getPool();
  const result = await pool.request().query<UserRow>(SELECT_USERS);
  return result.recordset.map(toUser);
}

export async function getUser(id: string): Promise<User | null> {
  // A malformed id means "no such user", not a failure -- `getCurrentUser()`
  // hands this whatever happens to be in the persona cookie.
  if (!isUuid(id)) return null;

  const pool = await getPool();
  const result = await pool
    .request()
    .input("id", sql.UniqueIdentifier, id)
    .query<UserRow>(SELECT_USER);

  const row = result.recordset[0];
  return row === undefined ? null : toUser(row);
}
