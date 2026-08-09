import { test, expect, ids } from "../fixtures/test-base";
import { clearCart } from "../fixtures/cart";

/**
 * TODO-176 (Task 8) — Senaryo 6: kupon uygula/kaldir + yeniden fiyatlandirma.
 *
 * Gercek kupon akisi ILK BAKISTAKI "input + apply" degildir: F4A.3 (ADR-060)
 * uygulamayi CLAIM (cuzdana ekle) ve KULLAN (sepete uygula) olarak IKI ADIMA
 * ayirir. "Kupon Kodu Ekle" formu (ClaimCouponForm) kodu cuzdana ekler; asil
 * indirim, cuzdan kartindaki "Kullan" butonu (AvailableCouponCard ->
 * applyWalletCouponAction) ile sepete yazilir. Kaldirma AppliedCouponControl
 * uzerinden (removeCouponAction).
 *
 * Ayni e2e musteri storageState'i suite boyunca paylasildigindan (bkz.
 * fixtures/cart.ts), kupon cuzdan-claim durumu TESTLER ARASI KALICIDIR (DB
 * tabanli). Bu yuzden akis SARTLI: kupon zaten cuzdanda ("Kullan" karti
 * gorunur) ise claim adimi ATLANIR — zaten-claim edilmis bir kodu tekrar
 * claim etmeye calismak (basarisiz claim Server Action'i) ile hemen ardindan
 * "Kullan" tiklamasi ARASINDA yaris durumu bulundu (basarisiz claim'in
 * cookie/revalidate sirasi, ayni anda calisan apply action'inin sonucunu
 * kaybettiriyordu — indirim UYGULANMIYORDU). Kosullu akis bu yarisi ORTADAN
 * KALDIRIR: yalniz kupon HENUZ cuzdanda degilse claim + web-first bekleme
 * yapilir, ardindan "Kullan" tiklanir.
 */
test.beforeEach(async ({ page }) => {
  await clearCart(page);
});

test("@smoke coupon apply reduces total and remove restores it", async ({ page }) => {
  const p = ids.variantProduct;
  await page.goto(`/products/${p.slug}`);
  await page.getByTestId(`variant-option-${p.variants[1].sku}`).click();
  await page.getByTestId("add-to-cart").click();
  await expect(page.getByTestId("cart-badge")).toHaveText("1");
  await page.goto("/cart");

  // Temiz taban cizgisi: onceki bir testten kalan uygulanmis kupon varsa once kaldir.
  if ((await page.getByTestId("coupon-remove").count()) > 0) {
    await page.getByTestId("coupon-remove").click();
    await expect(page.getByTestId("coupon-remove")).toHaveCount(0);
  }

  const total = page.getByTestId("cart-total");
  const baseline = (await total.innerText()).trim();
  expect(baseline).toBe("₺200,00"); // e2e-tshirt tekli fiyat, indirimsiz taban

  // Gercek akis: kupon cuzdanda degilse once claim ("Kupon Kodu Ekle" -> "Ekle"),
  // sonra kart uzerindeki "Kullan" ile sepete uygula.
  const useButton = page.getByTestId("coupon-use");
  if ((await useButton.count()) === 0) {
    await page.getByTestId("coupon-claim-toggle").click();
    await page.getByTestId("coupon-input").fill(ids.coupon.code);
    await page.getByTestId("coupon-apply").click();
    await expect(useButton).toBeVisible();
  }
  await useButton.click();

  // Is sonucu: yeniden fiyatlandirma gerceklesti (toplam degisti) VE dogru
  // yonde/buyuklukte (E2E10 = %10 -> ₺200,00 * 0.9 = ₺180,00).
  await expect(total).not.toHaveText(baseline);
  await expect(total).toHaveText("₺180,00");

  // Kaldirma: eski toplam geri gelir.
  await page.getByTestId("coupon-remove").click();
  await expect(total).toHaveText(baseline);
});
