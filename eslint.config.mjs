import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Claude Code worktrees, which live inside the repository at
    // `.claude/worktrees/<name>/`. Each is a separate checkout of this same
    // repository, with its own `.next/` build output and its own commit, so
    // linting them makes this checkout's result depend on the working state of
    // other branches -- and reports every source file two or three times over.
    //
    // ESLint has to be told: it does not read `.gitignore`, and it does not
    // skip dot-directories the way `tsc` does. The patterns above cannot cover
    // it either, because a flat-config `ignores` pattern containing a slash is
    // anchored to the config's base path -- `.next/**` matches `<root>/.next`
    // and nothing nested deeper.
    ".claude/worktrees/**",
  ]),

  /**
   * The application may not import the database administration tooling.
   *
   * `lib/data/migrate.mts` and `lib/data/seed.mts` are CLIs run by npm scripts.
   * Between them they issue DDL and delete every row this application owns, and
   * their safeguards -- `NODE_ENV`, an opt-in supplied at the moment of the
   * command -- are guards a request cannot reproduce. Nothing served over HTTP
   * has any business reaching them.
   *
   * Today nothing does. This rule is what keeps that true: the boundary was a
   * convention, and a convention is checked by whoever happens to notice.
   *
   * What it catches is static `import` and `export ... from`. A dynamic
   * `import()` is not seen by this rule, so it is not a sealed boundary -- but
   * the accidental version of this mistake is a plain import at the top of a
   * file, and that is the one it stops.
   *
   * Deliberately narrow. It names the two `.mts` CLIs and nothing else --
   * `lib/data/*.ts` is the application's own data-access layer, which
   * `lib/db.ts` must keep importing. The restriction is also scoped to the
   * application's `.ts`/`.tsx` files, so the CLIs themselves are unaffected.
   */
  {
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "lib/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/seed.mts",
                "**/migrate.mts",
                "./seed.mts",
                "./migrate.mts",
              ],
              message:
                "Database administration tooling is CLI-only: run it with " +
                "`npm run db:migrate` / `db:seed` / `db:reset`. Application " +
                "code goes through lib/db.ts.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
