import os from "node:os";
import { defineConfig } from "vitest/config";

// TODO-172 (ADR-273) — store-admin component testleri jsdom + @testing-library ile CPU-yoğundur.
// Vitest'in varsayılan `forks` havuzu maxForks ≈ çekirdek sayısı kadar açıp makineyi AŞIRI-ABONE eder;
// tam-suite (368 test) altında her fork'un event loop'u AÇLIĞA düşer ve en ağır userEvent form akışları
// 5000ms test timeout'unu aşabilir (flaky). Havuzu çekirdek−2 ile sınırlamak, her fork'a event-loop
// başı-boşluğu bırakır — bu bir DAVRANIŞ değil ZAMANLAMA düzeltmesidir (timeout maskesi DEĞİL; assertion
// davranışı değişmez). Ek olarak en ağır iki form testi `userEvent.setup({ delay: null })` ile tuş-arası
// yapay macrotask bağımlılığından arındırıldı (root-neden). Root config'in `esbuild.jsx` ayarı korunur.
const cores = typeof os.availableParallelism === "function" ? os.availableParallelism() : os.cpus().length;
const maxForks = Math.max(1, cores - 2);

export default defineConfig({
  esbuild: { jsx: "automatic" },
  test: {
    pool: "forks",
    poolOptions: {
      forks: { maxForks, minForks: 1 },
    },
  },
});
