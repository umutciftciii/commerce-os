import { test as setup, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";
import { PLATFORM_ADMIN_URL } from "../fixtures/env";

/**
 * TODO-178 Faz F — Platform Admin (admin-web) GERÇEK UI login'i. admin-web GLOBAL platform
 * konsoludur (mağaza-scope YOK); cookie `commerce_os_admin_session`. Aynı SUPER_ADMIN kullanıcı
 * (e2e-admin) hem store-admin hem platform login için geçerlidir (auth gerçeği TD-019). Üretilen
 * storageState platform-requests projelerine taşınır. Store admin login'i AYRI setup'tadır
 * (store-admin-auth.setup.ts) — iki farklı cookie/storageState.
 */
const authFile = "tests/e2e/.auth/platform-admin.json";

setup("authenticate platform admin via real UI login", async ({ page }) => {
  await page.goto(`${PLATFORM_ADMIN_URL}/login`);
  await page.locator("#email").fill(ids.storeAdmin.email);
  await page.locator("#password").fill(ids.storeAdmin.password);
  await page.getByRole("button", { name: /giriş yap/i }).click();
  // Login sonrası /login'den çıkılır (platform konsol kabuğuna yönlendirilir).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === "commerce_os_admin_session")).toBeTruthy();
  await page.context().storageState({ path: authFile });
});
