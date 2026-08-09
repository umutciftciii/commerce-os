import { test, expect, ids } from "../fixtures/test-base";
import { clearCart } from "../fixtures/cart";

/**
 * TODO-176 (Task 9) — Senaryo 7: cart -> checkout canonical cart identity.
 *
 * Invariant: kullanicinin sepette gordugu sepet == checkout'a tasinan sepettir.
 * Checkout'ta GENEL TOPLAM'a kargo/KDV eklenebilecegi icin (cart-view.tsx s.grandTotalLabel
 * vs checkout-form.tsx s.grandTotalLabel farkli tarife/adres durumunda ayrisabilir) kanonik
 * alan olarak ARA TOPLAM (subtotal, urun toplami) kullanilir — hem cart-view hem checkout-form
 * ayni CartView.summary.subtotalLabel'i render eder (bkz. cart-view.tsx:629, checkout-form.tsx:534).
 * Satir sayisi + varyant kimligi de dogrulanir: BUG-CART-003 sinifi bir regresyon (satir
 * dusmesi/duplikasyonu/yeniden-fiyatlandirma) subtotal esitse bile satir sayisi/varyant ile
 * yakalanir.
 */

test.beforeEach(async ({ page }) => {
  // Auth sepeti DB-tabanli ve testler ayni storageState'i paylasir; her testin
  // basinda bosalt (test izolasyonu — bkz. fixtures/cart.ts).
  await clearCart(page);
});

test("@smoke cart identity is preserved into checkout (lines + subtotal + variant)", async ({ page }) => {
  const p = ids.variantProduct;
  const l = p.variants[2]; // L

  await page.goto(`/products/${p.slug}`);
  await page.getByTestId(`variant-option-${l.sku}`).click();
  await page.getByTestId("add-to-cart").click();

  // add-to-cart sunucu eylemi asenkron; /cart'a gecmeden once is sonucunu
  // (rozet TAM 1) bekle — bkz. 04-cart-persistence.spec.ts.
  await expect(page.getByTestId("cart-badge")).toHaveText("1");

  await page.goto("/cart");

  const cartLines = page.getByTestId("cart-line");
  await expect(cartLines).toHaveCount(1);
  const cartLineCount = await cartLines.count();
  const cartSubtotal = (await page.getByTestId("cart-subtotal").innerText()).trim();

  await page.getByTestId("checkout-cta").click();
  await expect(page).toHaveURL(/\/checkout/);

  // Ayni satir sayisi (dusme/duplikasyon YOK).
  const checkoutLines = page.getByTestId("checkout-line");
  await expect(checkoutLines).toHaveCount(cartLineCount);

  // Ayni ara toplam (kanonik urun toplami; kargo/KDV disaridar).
  await expect(page.getByTestId("checkout-subtotal")).toHaveText(cartSubtotal);

  // DOGRU kalem tasindi: L varyanti checkout satirinda gorunur (sadece sayi/toplam
  // eslesmesi degil, esleyen ICERIK).
  await expect(checkoutLines.first()).toContainText(l.label);
});
