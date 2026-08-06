import { defineConfig } from "vitest/config";
import { boundedForkPool } from "../../vitest.shared";

// TODO-173-TI — ortak bounded fork politikası (jsdom smoke testleri). JSX automatic runtime .tsx smoke
// testlerinin per-file React import olmadan transform olmasını sağlar. ZAMANLAMA/KAYNAK düzeltmesi.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    ...boundedForkPool({ heavy: true }),
  },
});
