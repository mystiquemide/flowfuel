import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const config = [
  ...nextVitals,
  ...nextTs,
  {
    settings: {
      next: { rootDir: "apps/web" },
      react: { version: "19.3.0" },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "**/out/**",
      "**/build/**",
      "**/next-env.d.ts",
      "docs/**",
      "n8n/**",
    ],
  },
];

export default config;
