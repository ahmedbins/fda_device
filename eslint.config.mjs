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
    // Vite build output for Cloudflare Pages.
    "work/**",
  ]),
  {
    // These components also ship in the plain Vite SPA, where the pages are
    // separate HTML entries — cross-page navigation must be real <a> links.
    files: ["app/page.tsx", "app/monitor-page.tsx"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
]);

export default eslintConfig;
