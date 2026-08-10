import { test, expect, ids } from "../fixtures/test-base";

/**
 * TODO-176 (Task 10) — Senaryo 8: Hesabım > Siparişlerim listesi + sipariş detayı.
 *
 * Liste rotası `/account?section=orders` (bkz. apps/storefront-web/app/account/page.tsx
 * resolveSection — section yoksa varsayılan zaten "orders", ancak testte URL açıkça
 * belirtilir). Kart içindeki "Sipariş Detayı" linki (OrderActions, href=
 * `/account/orders/${orderNumber}`) üzerinden TIKLANARAK detaya geçilir (goto DEĞİL) —
 * böylece linkin gerçekten çalıştığı da doğrulanmış olur.
 *
 * Seed: e2e müşterisinin tek siparişi ids.seedOrderNumber, tek kalem ids.simpleProduct
 * (E2E Mug, adet 1). Bu test yalnız OKUR (mutasyon yok) → clearCart gerekmez.
 *
 * "Ham enum sızmadı" kontrolü: durum rozetleri (order-badges.tsx) i18n label'larından
 * render edilir (statusValues/paymentValues/fulfillmentDisplay, packages/i18n/src/locales/*),
 * bu yüzden body'de ham OrderStatus/PaymentStatus/FulfillmentStatus/ShipmentStatus (schema.prisma)
 * enum değerleri GÖRÜNMEMELİDİR — seed siparişinin kendi status'u (PLACED) dahil.
 */

test("@smoke seeded order appears in list and detail renders correctly", async ({ page }) => {
  await page.goto("/account?section=orders");

  const item = page.getByTestId("order-list-item").filter({ hasText: ids.seedOrderNumber });
  await expect(item).toBeVisible();

  // Kart üzerindeki gerçek "Sipariş Detayı" linkine tıkla (goto değil — linki de doğrular).
  await item.locator(`a[href^="/account/orders/"]`).click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${ids.seedOrderNumber}$`));

  // Seed: tam 1 kalem (e2e-mug, adet 1, ₺50,00) → toplam da ₺50,00 (kargo/vergi yok).
  await expect(page.getByTestId("order-detail-line")).toHaveCount(1);
  await expect(page.getByText(new RegExp(ids.simpleProduct.title, "i"))).toBeVisible();
  await expect(page.getByTestId("order-detail-total")).toContainText("50,00");

  // BUG-PS-001 — Order-line "Ürün desteği al" CTA'sı: her satırda görünür ve order+line
  // bağlamını doğru taşır (müşteri ürün/varyant yeniden seçmez). Bu assertion PR smoke
  // gate'inde koşar; CTA sessizce kaldırılırsa/bozulursa burada yakalanır. (Ayrıntılı
  // guided flow yalnız nightly `03-product-support.spec.ts` @regression'da — burada tekrarı yok.)
  const supportCta = page.getByTestId("support-line-cta").first();
  await expect(supportCta).toBeVisible();
  await expect(supportCta).toHaveAttribute(
    "href",
    `/account/support/new?order=${ids.seedOrderNumber}&line=${ids.support.orderLineId}`,
  );

  // Ham enum sızmamalı — durum yalnız çevrilmiş (Türkçe) etiketle görünür. Seed siparişi
  // PLACED/PAID/UNFULFILLED taşır (kargo kaydı yok) — PLACED dahil edilerek guard'ın
  // gerçekten bu siparişin kendi status'unu da denetlediği garanti edilir.
  await expect(page.locator("body")).not.toContainText(
    /\b(PAID|PENDING|UNPAID|FULFILLED|UNFULFILLED|CANCELLED|DRAFT|PLACED|CONFIRMED|PARTIAL|DELIVERED|RETURNED)\b/,
  );

  // CTA tıklanınca guided support wizard'ı açılır; ürün bağlamı (order+line'dan sunucu-türetilmiş)
  // hazır gelir — müşteri ürünü/siparişi yeniden seçmez. (Navigasyon en sonda: enum guard hâlâ
  // detay sayfasında koşsun.)
  await supportCta.click();
  await expect(page).toHaveURL(/\/account\/support\/new/);
  await expect(page.getByTestId("support-wizard")).toBeVisible();
  await expect(page.getByTestId("support-context-product")).toContainText(ids.simpleProduct.title);
});
