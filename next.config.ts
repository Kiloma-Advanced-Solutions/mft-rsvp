import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `mssql` is loaded with Node's own `require` rather than bundled.
   *
   * It has to be. The driver decides which tedious type to bind a parameter to
   * with a `switch` over **object identity** against the `TYPES` table in
   * `mssql/lib/datatypes.js` (`getTediousType` in `mssql/lib/tedious/request.js`).
   * Bundling produced a second instance of that module, so every `case` missed,
   * the lookup fell through, and each parameterised query failed with
   * `Validation failed for parameter 'id'. parameter.type.validate is not a
   * function` -- while unparameterised reads worked, which is what made it look
   * like a query bug rather than a bundling one.
   *
   * One shared instance of the driver also means one connection pool, which is
   * what `lib/data/client.ts` assumes when it caches the pool on `globalThis`.
   */
  serverExternalPackages: ["mssql"],
};

export default nextConfig;
