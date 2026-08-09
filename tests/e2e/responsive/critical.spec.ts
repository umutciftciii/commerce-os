import { test, expect, ids } from "../fixtures/test-base";
import { clearCart } from "../fixtures/cart";

/**
 * TODO-176 (Task 11) — Responsive-critical subset (`@responsive`).
 *
 * KUCUK subset: yalnizca 2 viewport (mobil 375x812, desktop 1440x900), tek akis (PDP varyant secimi
 * + sepete ekle → rozet). Ana functional akis zaten smoke'ta desktop'ta kosuyor (bkz. smoke/03); burada
 * amac yalniz farkli viewport genisliklerinde ayni akisin KIRILMADIGINI dogrulamak (ör. header/cart-link
 * mobilde gizli DEGIL — bkz. site-header.tsx, `hidden` sinifi yok).
 *
 * Izolasyon: auth musteri sepeti sunucu/DB-tabanli ve `responsive` projesi `smoke` ile AYNI storageState'i
 * paylasir; testler arasi (ve smoke ile arasi) capraz kirlenmeyi onlemek icin her testin basinda sepeti
 * bosalt (bkz. fixtures/cart.ts). Config `workers:1` dosyalar arasi sirali calismayi garanti eder.
 */
test.beforeEach(async ({ page }) => {
  await clearCart(page);
});

for (const vp of [
  { w: 375, h: 812 },
  { w: 1440, h: 900 },
]) {
  test(`@responsive PDP + add-to-cart at ${vp.w}px`, async ({ page }) => {
    const p = ids.variantProduct;
    const [s] = p.variants;

    await page.setViewportSize({ width: vp.w, height: vp.h });
    await page.goto(`/products/${p.slug}`);
    await page.getByTestId(`variant-option-${s.sku}`).click();
    await expect(page.getByTestId("add-to-cart")).toBeEnabled();
    await page.getByTestId("add-to-cart").click();

    // Is sonucu: rozet sepete eklenen tek kalemi yansitir (viewporttan bagimsiz).
    await expect(page.getByTestId("cart-badge")).toHaveText(/1/);
  });
}
