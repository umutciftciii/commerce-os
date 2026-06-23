import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.turbo/**",
      "packages/db/generated/**",
      "**/*.config.*",
      "**/*.cjs",
      "**/next-env.d.ts",
    ],
  },
  {
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Frontend (React/Next) files: TS parser with JSX + browser globals.
    files: ["apps/**/*.{ts,tsx}", "packages/ui/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: {
        window: "readonly",
        document: "readonly",
        fetch: "readonly",
        navigator: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        URL: "readonly",
        Response: "readonly",
        React: "readonly",
      },
    },
  },
];
