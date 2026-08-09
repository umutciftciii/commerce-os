import { test, expect } from "@playwright/test";

/**
 * Shopping Balance Admin — hızlı, salt-okunur READ smoke. Finans > Alışveriş Bakiyesi
 * listesi + KPI özeti render olur ve en az bir müşteri satırı görünür. Mutation YOK
 * (deterministik; required gate'e uygun). storageState = store-admin.json.
 */
test("@admin-smoke shopping balance list + KPI render", async ({ page }) => {
  await page.goto("/finance/shopping-balance");
  await expect(page.getByRole("heading", { name: /Alışveriş Bakiyesi|Shopping Balance/i })).toBeVisible();
  await expect(page.getByTestId("sb-kpi-outstanding")).toBeVisible();
  await expect(page.getByTestId("shopping-balance-row-link").first()).toBeVisible();
});
