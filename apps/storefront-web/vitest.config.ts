import { defineConfig } from "vitest/config";
import { boundedForkPool } from "../../vitest.shared";

// TODO-173-TI — storefront testleri (RTL + RSC render) CPU-yoğundur. Ortak `boundedForkPool({ heavy })`
// politikası fork havuzunu sınırlar (root `test` script'i `--concurrency=1` ile suite'leri sıralı koşar).
// ZAMANLAMA/KAYNAK düzeltmesi; test timeout'ları ARTIRILMAZ. Test environment per-file pragma ile
// yönetilir (bu config yalnız pool + jsx ekler; mevcut davranışı korur).
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    ...boundedForkPool({ heavy: true }),
  },
});
