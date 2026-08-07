import { defineConfig } from "vitest/config";
import { boundedForkPool } from "../../vitest.shared";

// TODO-173-TI — admin-web testleri (BFF route + jsdom RTL) CPU-yoğundur. Ortak `boundedForkPool({ heavy })`
// politikası fork havuzunu sınırlar (root `test` script'i `--concurrency=1` ile suite'leri sıralı koşar).
// ZAMANLAMA/KAYNAK düzeltmesi; test timeout'ları ARTIRILMAZ. Test environment per-file pragma ile yönetilir.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    ...boundedForkPool({ heavy: true }),
  },
});
