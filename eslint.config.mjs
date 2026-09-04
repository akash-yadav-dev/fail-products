import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Agent worktrees are checked out inside the repository, so their build
    // output is a second copy of .next that eslint would otherwise lint --
    // 76 errors from minified Turbopack chunks, in a run that says nothing
    // about this project source. It made verify-changes.sh report BLOCK on a
    // branch whose own source was clean, which is worse than no check.
    ".claude/**",

    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
