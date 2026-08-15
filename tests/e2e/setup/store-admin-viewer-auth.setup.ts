import { test as setup, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";
import { STORE_ADMIN_URL } from "../fixtures/env";

/**
 * Phase G (§5 — RBAC browser coverage) — VIEWER StoreUser GERÇEK UI login'i. En kısıtlı rol;
 * storageState `store-admin-viewer.json` restricted-role spec'ine taşınır. OWNER setup'ıyla AYNI
 * gerçek `/auth/store/login` akışı (PlatformUser storageState/token DEĞİL).
 */
const authFile = "tests/e2e/.auth/store-admin-viewer.json";

setup("authenticate store admin VIEWER via real UI login", async ({ page }) => {
  await page.goto(`${STORE_ADMIN_URL}/login`);
  await page.locator("#email").fill(ids.storeAuth.viewer.email);
  await page.locator("#password").fill(ids.storeAuth.viewer.password);
  await page.getByRole("button", { name: /giriş|login|oturum/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === "commerce_os_store_admin_session")).toBeTruthy();
  await page.context().storageState({ path: authFile });
});
