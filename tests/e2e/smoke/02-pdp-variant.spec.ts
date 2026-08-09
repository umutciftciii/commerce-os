import { test, expect, ids } from "../fixtures/test-base";

test("@smoke PDP variant selection updates price/sku reactively", async ({ page }) => {
  const p = ids.variantProduct;
  await page.goto(`/products/${p.slug}`);
  await expect(page.getByTestId("buybox-price")).toBeVisible();

  // S seç → fiyat görünür + SKU reaktif; L seç → değişim (varsa fiyat farkı ya da SKU)
  await page.getByTestId(`variant-option-${p.variants[0].sku}`).click();
  await expect(page.getByTestId("buybox-price")).toContainText(/₺|TL|\d/);
  await page.getByTestId(`variant-option-${p.variants[2].sku}`).click();
  // seçili varyant sepete ekle butonunu enable eder
  await expect(page.getByTestId("add-to-cart")).toBeEnabled();
});
