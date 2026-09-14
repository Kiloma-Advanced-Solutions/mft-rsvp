/**
 * The SQL Server connection pool. SERVER ONLY.
 *
 * `import "server-only"` on the line below is the database boundary. It is the
 * deepest point in the chain, so it protects everything above it transitively:
 * this is the only module that imports the driver or reads the connection
 * string, and a Client Component that reached `lib/db.ts` would trip this import
 * on the way down. That is why the marker lives here and nowhere else.
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
import type { ConnectionPool } from "mssql";

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
  // handing out, so the next caller builds a new one.
  pool.on("error", forget);

  // And if anything closes it, the cache must not keep serving a closed pool.
  const close = pool.close.bind(pool);
  pool.close = ((...args: Parameters<typeof close>) => {
    forget();
    return close(...args);
  }) as typeof pool.close;

  return pending;
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
