import { test, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";

/**
 * Shopping Balance Admin — ağır mutation regresyonu (grant + persistence + izolasyon).
 *
 * Re-run (Run1+Run2) DETERMİNİZMİ: goodwill grant her seferinde YENİ lot ekler (idempotencyKey
 * modal-open başına), bu yüzden SABİT tutar assert edilmez. Bunun yerine: liste↔detay tutarlılığı
 * ("doğru available"), grant sonrası DEĞİŞİM (artış), reload persistence — hepsi re-run güvenli.
 * storageState = store-admin.json; store-admin app mağazayı e2e-store seçer.
 */
const sb = ids.shoppingBalanceAdmin;

test("@admin-regression list → detail → lot/ledger → grant → increase → persist", async ({ page }) => {
  await page.goto("/finance/shopping-balance");

  // 1) Liste render + seed'lenen müşteri satırı mevcut.
  const row = page.locator("tr", { hasText: sb.customerEmail });
  await expect(row).toBeVisible();

  // 2) "Doğru available balance": liste satırındaki kullanılabilir tutar (2. kolon) yakalanır.
  const listAvailable = (await row.locator("td").nth(1).innerText()).trim();
  expect(listAvailable).toMatch(/[₺]|\d/);

  // 3) Cross-store izolasyon: e2e-store-2 müşterisi bu listede ASLA görünmez.
  await expect(page.locator("body")).not.toContainText(sb.otherStoreCustomerEmail);

  // 4) Detaya in.
  await row.getByTestId("shopping-balance-row-link").click();
  await expect(page).toHaveURL(/\/finance\/shopping-balance\/.+/);

  // 5) Detay available == liste available (tutarlılık).
  const detailAvailable = page.getByTestId("sb-detail-available");
  await expect(detailAvailable).toHaveText(listAvailable);

  // 6) Lot + ledger görünür; RAW ENUM sızmaz.
  await expect(page.getByTestId("sb-lot-row").first()).toBeVisible();
  await expect(page.getByTestId("sb-ledger-row").first()).toBeVisible();
  await expect(page.locator("body")).not.toContainText("ADMIN_GOODWILL_CREDIT");

  const before = (await detailAvailable.innerText()).trim();

  // 7) Bakiye tanımla (goodwill grant) → anında artış.
  await page.getByRole("button", { name: /Bakiye Tanımla|Add Balance/i }).click();
  await page.getByTestId("sb-grant-amount").fill(sb.grantAmountTl);
  await page.getByTestId("sb-grant-submit").click();
  await expect(detailAvailable).not.toHaveText(before, { timeout: 15_000 });
  const after = (await detailAvailable.innerText()).trim();

  // 8) Reload sonrası persistence (yeni bakiye kalıcı).
  await page.reload();
  await expect(page.getByTestId("sb-detail-available")).toHaveText(after);
});
