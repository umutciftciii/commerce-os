import { defineConfig, devices } from "@playwright/test";
import { STOREFRONT_URL } from "./tests/e2e/fixtures/env";

const CI = !!process.env.CI;
export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: CI,
  fullyParallel: false,
  retries: CI ? 2 : 0,
  workers: CI ? 2 : undefined,
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
