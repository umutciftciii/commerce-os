import { defineConfig, devices } from "@playwright/test";
import { STOREFRONT_URL } from "./tests/e2e/fixtures/env";

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
    { name: "setup", testMatch: /setup\/.*\.setup\.ts/ },
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
      name: "prod-smoke",
      testDir: "tests/e2e/prod-smoke",
      grep: /@prod-smoke/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
