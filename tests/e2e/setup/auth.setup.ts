import { test as setup, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";
import { STOREFRONT_URL } from "../fixtures/env";

const authFile = "tests/e2e/.auth/customer.json";

setup("authenticate customer via real UI login", async ({ page }) => {
  await page.goto(`${STOREFRONT_URL}/auth/login`);
  await page.locator("#login-identifier").fill(ids.customer.email);
  await page.locator("#login-password").fill(ids.customer.password);
  await page.getByRole("button", { name: /giriş|login|oturum/i }).click();
  await expect(page).toHaveURL(/\/account(\/|$|\?)/, { timeout: 15_000 });
  // gerçek session cookie yakalandı doğrula
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === "commerce_os_customer_session")).toBeTruthy();
  await page.context().storageState({ path: authFile });
});
