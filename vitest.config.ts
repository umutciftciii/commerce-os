import { defineConfig } from "vitest/config";

// Root config for `pnpm test:unit` aggregate runs. JSX automatic runtime lets
// .tsx smoke tests (packages/ui) transform without a per-file React import.
// Backend .ts tests are unaffected.
export default defineConfig({
  esbuild: { jsx: "automatic" },
});
