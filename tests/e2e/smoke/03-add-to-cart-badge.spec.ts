import { test, expect, ids } from "../fixtures/test-base";
import { clearCart } from "../fixtures/cart";

test.beforeEach(async ({ page }) => {
  // Auth sepeti DB-tabanli ve testler ayni storageState'i paylasir; her testin
  // basinda bosalt (test izolasyonu — bkz. fixtures/cart.ts).
  await clearCart(page);
});

test("@smoke add-to-cart increments badge and persists correct line", async ({ page }) => {
  const p = ids.variantProduct;
  const [, m] = p.variants;

  await page.goto(`/products/${p.slug}`);
  await page.getByTestId(`variant-option-${m.sku}`).click();
  await page.getByTestId("add-to-cart").click();

  // Is sonucu: rozet TAM 1 gosterir (sepette tek kalem).
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  await page.getByTestId("cart-link").click();
  await expect(page).toHaveURL(/\/cart/);

  const lines = page.getByTestId("cart-line");
  await expect(lines).toHaveCount(1);

  const line = lines.first();
  await expect(line).toContainText(p.title);
  await expect(line.getByTestId("cart-line-variant")).toHaveText(m.label);
});
