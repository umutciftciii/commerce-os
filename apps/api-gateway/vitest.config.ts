import { defineConfig } from "vitest/config";
import { boundedForkPool } from "../../vitest.shared";

// TODO-173-TI — api-gateway backend + gerçek-DB integration suite'i (2400+ test). Ortak bounded fork
// politikası (backend: çekirdek−2). Root `test` script'i `--concurrency=1` ile bu ağır DB suite'i UI
// suite'leriyle AYNI ANDA koşmaz (aşırı-abonelik yok). ZAMANLAMA/KAYNAK düzeltmesi; timeout ARTIRILMAZ.
export default defineConfig({
  test: {
    ...boundedForkPool({ heavy: false }),
  },
});
