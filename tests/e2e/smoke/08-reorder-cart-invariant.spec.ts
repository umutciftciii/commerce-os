import { test, expect, ids } from "../fixtures/test-base";
import { clearCart } from "../fixtures/cart";

/**
 * TODO-176B — BUG-CART-006 regresyon: "Siparişlerim → Tekrar Satın Al" invariant.
 *
 * BUG: `buyAgainAction` (order-actions.ts) hibrit cart'a (TODO-167/ADR-266) göre
 * güncellenmemişti — oturum açmış müşteride bile sepete KOŞULSUZ cookie'ye yazıyordu
 * (`writeCartItems`). Oysa auth cart DB-otoriter (`getAuthCartProjection`); nav rozeti +
 * `/cart` + checkout hepsi DB cart okur. Reorder her zaman authenticated bağlamda çalışır
 * (order detail `x-customer-session` ister) → cookie yazımı DAİMA yanlış defter → UI
 * "sepete eklendi" başarısı gösterir ama rozet artmaz ve `/cart` boş kalır.
 *
 * INVARIANT (kanıtlanan): reorder mutation canonical cart == /cart canonical cart ==
 * checkout canonical cart. Bu test tüm zinciri sürer:
 *   1) auth müşteri (storageState) → 2) sepeti izole et (clearCart) →
 *   3) Siparişlerim → 4) Tekrar Satın Al → 5) başarı YALNIZ persistence sonrası →
 *   6) header rozeti artar → 7) /cart → 8) doğru variant + adet + fiyat →
 *   9) refresh sonrası korunur → 10) checkout'ta aynı satır.
 *
 * Seed: `ids.reorderOrder` (e2e-order-2001) = e2e-tshirt varyant M × 2 (₺400,00). Çok-varyantlı
 * + adet>1 → "doğru variant + qty + fiyat" invariant'ını tek-satır mug'dan daha güçlü kanıtlar.
 *
 * @smoke gate'e DAHİL (release-kritik regression; deterministik).
 */

test.beforeEach(async ({ page }) => {
  // Auth sepeti DB-tabanlı ve testler storageState paylaşır → izolasyon için boşalt.
  await clearCart(page);
});

test("@smoke reorder persists into DB cart: badge + /cart + checkout stay identical", async ({
  page,
}) => {
  const ro = ids.reorderOrder;

  // 3) Siparişlerim: reorder siparişini bul.
  await page.goto("/account?section=orders");
  const card = page
    .getByTestId("order-list-item")
    .filter({ hasText: ro.number });
  await expect(card).toBeVisible();

  // 4) "Tekrar Satın Al" → 5) success YALNIZCA persistence sonrası döner (server action).
  await card.getByTestId("order-buy-again").click();
  await expect(card.getByTestId("order-buy-again-success")).toBeVisible();
  // "1 ürün sepete eklendi" (tek satır: tshirt-M — adet mesajda değil, satır sayısı).
  await expect(card.getByTestId("order-buy-again-success")).toContainText(/1/);

  // 6) Header rozeti sepetteki TOPLAM adedi gösterir (tshirt M × 2 = 2).
  await expect(page.getByTestId("cart-badge")).toHaveText("2");

  // 7) Sepete git.
  await page.goto("/cart");

  // 8) Tam olarak 1 satır; doğru varyant (M) + doğru adet (2) + doğru ara toplam (₺400,00).
  const lines = page.getByTestId("cart-line");
  await expect(lines).toHaveCount(1);
  const line = lines.first();
  await expect(line).toContainText(ids.variantProduct.title);
  await expect(line.getByTestId("cart-line-variant")).toHaveText(ro.variantLabel);
  await expect(page.getByTestId("cart-subtotal")).toContainText(ro.expectedSubtotalText);

  // 9) Tam sayfa yenilemeden sonra korunur (kalıcılık = DB cart, sadece sayfa yüklemesi değil).
  await page.reload();
  await expect(page.getByTestId("cart-line")).toHaveCount(1);
  await expect(page.getByTestId("cart-badge")).toHaveText("2");
  await expect(page.getByTestId("cart-subtotal")).toContainText(ro.expectedSubtotalText);

  // 10) Checkout'ta AYNI kanonik satır görünür (reorder == /cart == checkout).
  const cartSubtotal = (await page.getByTestId("cart-subtotal").innerText()).trim();
  await page.getByTestId("checkout-cta").click();
  await expect(page).toHaveURL(/\/checkout/);
  const checkoutLines = page.getByTestId("checkout-line");
  await expect(checkoutLines).toHaveCount(1);
  await expect(checkoutLines.first()).toContainText(ro.variantLabel);
  await expect(page.getByTestId("checkout-subtotal")).toHaveText(cartSubtotal);
});
