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
]);

export default eslintConfig;
