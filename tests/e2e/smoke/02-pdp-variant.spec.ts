import { test, expect, ids } from "../fixtures/test-base";

test("@smoke PDP variant selection updates price/sku reactively", async ({ page }) => {
  const p = ids.variantProduct;
  const [s, m, l] = p.variants;
  await page.goto(`/products/${p.slug}`);
  await expect(page.getByTestId("buybox-price")).toBeVisible();

  // Varsayilan secim = en ucuz varyant (S) — SSR ilk state ile tutarli olmali.
  await expect(page.getByTestId("buybox-sku")).toHaveText(s.sku);

  // L sec → SKU S'ten L'ye DEGISMELI (varsayilanla ayni degilse tiklama gercekten
  // secimi surukluyor demektir; regres bir no-op handler'da bu adim FAIL eder).
  await page.getByTestId(`variant-option-${l.sku}`).click();
  await expect(page.getByTestId("buybox-sku")).toHaveText(l.sku);

  // M sec → SKU tekrar DEGISMELI (L'den M'ye).
  await page.getByTestId(`variant-option-${m.sku}`).click();
  await expect(page.getByTestId("buybox-sku")).toHaveText(m.sku);

  // Stokta olan secili varyant ile sepete ekle butonu enable olmalidir.
  await expect(page.getByTestId("add-to-cart")).toBeEnabled();
});
