import { defineConfig, devices } from "@playwright/test";
import { STOREFRONT_URL, STORE_ADMIN_URL } from "./tests/e2e/fixtures/env";

const CI = !!process.env.CI;
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: CI,
  fullyParallel: false,
  retries: CI ? 2 : 0,
  // Tek worker: smoke/responsive projeleri ayni e2e musterinin DB-tabanli
  // (server-authoritative) sepetini paylasir (bkz. fixtures/cart.ts). Farkli
  // spec dosyalari farkli worker'larda calisirsa (workers>1) ayni sepet
  // uzerinde yaris durumu olusur (ör. 03 ve 04 es zamanli add-to-cart/assert).
  // fullyParallel:false yalnizca TEK dosya icindeki testleri sirali yapar,
  // dosyalar arasi izolasyonu SAGLAMAZ — bu yuzden workers:1 gerekli.
  workers: 1,
  reporter: CI ? [["list"], ["html", { open: "never" }], ["github"]] : [["list"], ["html", { open: "never" }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: STOREFRONT_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "on-first-retry",
    actionTimeout: 10_000,
  },
  projects: [
    // Müşteri (storefront) login setup — YALNIZ auth.setup.ts (store-admin setup ayrı proje).
    { name: "setup", testMatch: /setup\/auth\.setup\.ts/ },
    // Store-admin (platform) login setup — Shopping Balance Admin E2E için ayrı storageState.
    { name: "store-admin-setup", testMatch: /setup\/store-admin-auth\.setup\.ts/ },
    {
      name: "smoke",
      testDir: "tests/e2e/smoke",
      grep: /@smoke/,
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/customer.json" },
      dependencies: ["setup"],
    },
    {
      name: "responsive",
      testDir: "tests/e2e/responsive",
      grep: /@responsive/,
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/customer.json" },
      dependencies: ["setup"],
    },
    {
      // TODO-176B (PR2) — Daha ağır finansal/lifecycle regresyon senaryoları. Smoke gate'in
      // DIŞINDA (PR smoke süresini büyütmez); nightly/manuel `pnpm e2e:regression` ile koşar.
      name: "regression",
      testDir: "tests/e2e/regression",
      grep: /@regression/,
      use: { ...devices["Desktop Chrome"], storageState: "tests/e2e/.auth/customer.json" },
      dependencies: ["setup"],
    },
    {
      // Shopping Balance Admin — hızlı, salt-okunur admin READ smoke (required gate'e uygun).
      name: "admin-smoke",
      testDir: "tests/e2e/admin-smoke",
      grep: /@admin-smoke/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: STORE_ADMIN_URL,
        storageState: "tests/e2e/.auth/store-admin.json",
      },
      dependencies: ["store-admin-setup"],
    },
    {
      // Shopping Balance Admin — ağır mutation regresyonu (grant + persistence + izolasyon).
      // Nightly/manuel `pnpm e2e:admin-regression`; PR smoke süresini büyütmez.
      name: "admin-regression",
      testDir: "tests/e2e/admin-regression",
      grep: /@admin-regression/,
      use: {
        ...devices["Desktop Chrome"],
        baseURL: STORE_ADMIN_URL,
        storageState: "tests/e2e/.auth/store-admin.json",
      },
      dependencies: ["store-admin-setup"],
    },
    {
      // PERF-001 — Kaba (wall-clock) navigasyon gecikmesi regresyon muhafızı.
      // Vitrin baseURL'i + anonim gezinme (auth GEREKMEZ → `setup` bağımlılığı yok,
      // yaygın vitrin yolu ölçülür). Required smoke gate'in DIŞINDA: `pnpm e2e:perf`
      // ile manuel/nightly koşar; wall-clock varyansı merge'i bloke etmez.
      name: "perf",
      testDir: "tests/e2e/perf",
      grep: /@perf/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "prod-smoke",
      testDir: "tests/e2e/prod-smoke",
      grep: /@prod-smoke/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
