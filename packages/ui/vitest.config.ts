import { defineConfig } from "vitest/config";

// JSX automatic runtime so .tsx smoke tests transform without a per-file React import.
export default defineConfig({
  esbuild: { jsx: "automatic" },
});
