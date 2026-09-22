/**
 * The SQL Server connection pool. SERVER ONLY.
 *
 * `import "server-only"` on the line below is the database boundary. It is the
 * deepest point in the chain, so it protects everything above it transitively:
 * this is the only module that reads the connection string or owns the pool's
 * lifecycle, every module that reaches the database comes through it, and a
 * Client Component that reached `lib/db.ts` would trip this import on the way
 * down. That is why the marker lives here and nowhere else.
 *
 * Its siblings under `lib/data/` do import `mssql` themselves, for the type
 * constants a parameter needs -- `sql.UniqueIdentifier` and the rest. That is
 * not a breach of the boundary: a type constant names a column type, carries no
 * connection and opens nothing. What belongs here alone is the configuration
 * and the pool.
 *
 *   Server Component / Route Handler -> lib/db.ts -> lib/data/* -> mssql -> SQL Server
 *
 * Configuration is one environment variable holding a complete connection
 * string, so the server, database, credentials and encryption are described by
 * the environment rather than assembled in code. Nothing security-related is
 * set or overridden here: no `encrypt`, no `trustServerCertificate`, no TDS
 * version. If a deployment needs different settings, it says so in its own
 * connection string.
 *
 * Nothing in this file logs the connection string, and the "not configured"
 * error names the variable without quoting its value.
 *
 * The database administration CLIs -- `migrate.mts`, `seed.mts` -- do not come
 * through here. They cannot: `server-only` is a specifier that only Next's
 * compiler resolves, and a bare-Node script has no way to import it. They open
 * their own short-lived pool and close it on the way out, which is what a
 * one-shot process wants anyway.
 */

import "server-only";

import sql from "mssql";
import type { ConnectionPool, Transaction } from "mssql";

/**
 * Anything that can hand out a request: the pool, or a transaction on it.
 *
 * A function that takes one of these can be called from inside a transaction or
 * outside it, which is what lets a read be reused by a locked write path
 * without a second copy of the statement.
 *
 * The two are not interchangeable in one respect: a `Transaction` owns a single
 * dedicated connection, so its requests must be issued one after another.
 * `Promise.all` over a transaction fails with "There is another request in
 * progress"; over the pool it is fine, because every request gets its own
 * connection.
 */
export type Runner = ConnectionPool | Transaction;

/**
 * The single source of connection configuration.
 *
 * Exported so the message that complains about it and the documentation in
 * `.env.example` cannot drift from the name actually read.
 */
export const CONNECTION_STRING_VAR = "EVENTS_DB_CONNECTION_STRING";

function readConnectionString(): string {
  const value = process.env[CONNECTION_STRING_VAR];
  if (value === undefined || value.trim() === "") {
    // Names the variable, never its value.
    throw new Error(
      `${CONNECTION_STRING_VAR} is not set. Copy .env.example to .env.local and ` +
        `set it to the SQL Server connection string for your environment.`,
    );
  }
  return value;
}

/**
 * `next dev` re-evaluates modules on every edit, so a module-scoped pool would
 * leak a fresh one on every save. Hence `globalThis`, which survives that.
 *
 * The **promise** is cached rather than the pool, so callers that arrive while
 * the first connection is still opening share that attempt instead of racing to
 * build a second pool.
 */
const globalForPool = globalThis as typeof globalThis & {
  __eventsBoardPool?: Promise<ConnectionPool>;
};

/**
 * The pool, connected. Safe to call on every request: the first call opens it
 * and every later one gets the same connection.
 */
export function getPool(): Promise<ConnectionPool> {
  const existing = globalForPool.__eventsBoardPool;
  if (existing) return existing;

  const pool = new sql.ConnectionPool(readConnectionString());
  const pending = pool.connect();
  globalForPool.__eventsBoardPool = pending;

  /**
   * Drop this attempt from the cache, but only if it is still the current one --
   * a later `getPool()` may already have replaced it.
   */
  const forget = () => {
    if (globalForPool.__eventsBoardPool === pending) {
      delete globalForPool.__eventsBoardPool;
    }
  };

  // A first connection that fails must not be cached forever. Without this the
  // rejected promise is handed to every later caller and the only way back is a
  // server restart -- so a database that was briefly unreachable would look
  // permanently unreachable.
  pending.catch(forget);

  // Same reasoning once the pool is up: a pool that has errored is not worth
  // handing out, so the next caller builds a new one -- and this one is closed
  // rather than merely dropped.
  //
  // Forgetting alone was not enough. By the time `error` fires the pool has
  // connected, so it owns a live connection pool of its own; dropping the last
  // reference without closing leaves those sockets open and their reaper
  // running until they idle out, while the next request builds a second pool
  // beside them. Closing a pool that never connected is a no-op in the driver,
  // and closing one twice is guarded there too, so this is safe on every path.
  pool.on("error", () => {
    forget();
    void pool.close().catch(() => undefined);
  });

  // And if anything closes it, the cache must not keep serving a closed pool.
  const close = pool.close.bind(pool);
  pool.close = ((...args: Parameters<typeof close>) => {
    forget();
    return close(...args);
  }) as typeof pool.close;

  return pending;
}

/**
 * Runs `work` in a transaction, all of it or none.
 *
 * Lives here rather than beside any one table because more than one module now
 * needs it: events are written across three tables, and a seat claim has to
 * hold a lock across a read, a decision and a write.
 *
 * Same defensive shape as `migrate.mts` and `seed.mts`: the server can abort a
 * transaction on its own -- a deadlock victim is exactly that -- after which
 * rolling back again throws, and the `rollback` event is how we know it
 * happened.
 */
export async function inTransaction<T>(
  pool: ConnectionPool,
  work: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  const transaction = new sql.Transaction(pool);

  let abortedByServer = false;
  transaction.on("rollback", () => {
    abortedByServer = true;
  });

  await transaction.begin();

  try {
    const result = await work(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    if (!abortedByServer) await transaction.rollback().catch(() => undefined);
    throw error;
  }
}

/**
 * Close the pool, if one is open.
 *
 * For scripts and one-shot processes that need the event loop to drain. The
 * application never calls this: its pool is meant to live as long as the server,
 * and closing it would only add reconnection cost to the next request.
 */
export async function closePool(): Promise<void> {
  const existing = globalForPool.__eventsBoardPool;
  if (!existing) return;

  delete globalForPool.__eventsBoardPool;

  // A pool that never connected has nothing to close, and its rejection has
  // already been reported to whoever called `getPool()`.
  const pool = await existing.catch(() => null);
  await pool?.close();
}
