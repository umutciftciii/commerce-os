import { test as setup, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";
import { STORE_ADMIN_URL } from "../fixtures/env";

/**
 * Shopping Balance Admin E2E — store-admin GERÇEK UI login'i. Cookie
 * `commerce_os_store_admin_session`; store-admin app aktif mağazayı kimlik doğrulanan StoreUser
 * oturumundan türetir (gateway ön-login tenant = STORE_ADMIN_STORE_SLUG=e2e-store). storageState
 * admin projelerine (admin-smoke/admin-regression) taşınır.
 */
const authFile = "tests/e2e/.auth/store-admin.json";

setup("authenticate store admin via real UI login", async ({ page }) => {
  await page.goto(`${STORE_ADMIN_URL}/login`);
  await page.locator("#email").fill(ids.storeAdmin.email);
  await page.locator("#password").fill(ids.storeAdmin.password);
  await page.getByRole("button", { name: /giriş|login|oturum/i }).click();
  // Login sonrası /login'den çıkılır (app kabuğuna yönlendirilir).
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === "commerce_os_store_admin_session")).toBeTruthy();
  await page.context().storageState({ path: authFile });
});
