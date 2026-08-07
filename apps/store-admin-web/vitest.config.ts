import { defineConfig } from "vitest/config";
import { boundedForkPool } from "../../vitest.shared";

// TODO-172 (ADR-273) / TODO-173-TI — store-admin component testleri jsdom + @testing-library ile
// CPU-yoğundur. Ortak `boundedForkPool({ heavy })` politikası fork havuzunu sınırlar (root `test`
// script'i `--concurrency=1` ile suite'leri sıralı koşar → cross-suite aşırı-abonelik yok). Bu bir
// ZAMANLAMA/KAYNAK düzeltmesidir; test timeout'ları ARTIRILMAZ. En ağır form testleri ayrıca
// `userEvent.setup({ delay: null })` kullanır (root-neden). Root config'in `esbuild.jsx` ayarı korunur.
export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    ...boundedForkPool({ heavy: true }),
  },
});
