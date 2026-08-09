import { test, expect, ids } from "../fixtures/test-base";

test("@smoke authenticated session persists and shows account @responsive", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/account");
  await expect(page).toHaveURL(/\/account(\/|$|\?)/); // login'e redirect OLMAMALI

  // Hesap kontrolu dropdown'i (header) — greeting'i gostermek icin ac.
  await page.locator('[aria-haspopup="menu"]').first().click();
  const greeting = page.getByTestId("account-greeting");
  await expect(greeting).toBeVisible();
  await expect(greeting).toContainText(ids.customer.firstName);

  await page.reload();
  await expect(page).toHaveURL(/\/account(\/|$|\?)/); // reload sonrası hâlâ oturumlu
  expect(errors, `console/runtime errors: ${errors.join(" | ")}`).toEqual([]);
});
