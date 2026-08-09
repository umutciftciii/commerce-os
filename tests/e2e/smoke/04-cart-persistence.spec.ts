import { test, expect, ids } from "../fixtures/test-base";
import { clearCart } from "../fixtures/cart";

test.beforeEach(async ({ page }) => {
  // Auth sepeti DB-tabanli ve testler ayni storageState'i paylasir; her testin
  // basinda bosalt (test izolasyonu — bkz. fixtures/cart.ts).
  await clearCart(page);
});

test("@smoke cart survives reload (cookie-backed persistence)", async ({ page }) => {
  const p = ids.variantProduct;
  const [s] = p.variants;

  await page.goto(`/products/${p.slug}`);
  await page.getByTestId(`variant-option-${s.sku}`).click();
  await page.getByTestId("add-to-cart").click();

  // Is sonucu: rozet TAM 1 gosterir (sepette tek kalem).
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  await page.goto("/cart");
  await expect(page.getByTestId("cart-line")).toHaveCount(1);

  await page.reload();

  // Reload sonrasi is sonucu: ayni tek satir + rozet + dogru urun/varyant korunur
  // (tam sayfa yenilemeden sonra kalicilik kaniti — sadece sayfa yuklemesi degil).
  const lines = page.getByTestId("cart-line");
  await expect(lines).toHaveCount(1);
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  const line = lines.first();
  await expect(line).toContainText(p.title);
  await expect(line.getByTestId("cart-line-variant")).toHaveText(s.label);
});
