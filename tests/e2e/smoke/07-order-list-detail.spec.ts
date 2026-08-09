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
 * bu yüzden body'de ham PAID/PENDING/UNPAID/FULFILLED/UNFULFILLED/CANCELLED/DRAFT enum
 * değerleri GÖRÜNMEMELİDİR.
 */

test("@smoke seeded order appears in list and detail renders correctly", async ({ page }) => {
  await page.goto("/account?section=orders");

  const item = page.getByTestId("order-list-item").filter({ hasText: ids.seedOrderNumber });
  await expect(item).toBeVisible();

  // Kart üzerindeki gerçek "Sipariş Detayı" linkine tıkla (goto değil — linki de doğrular).
  await item.locator(`a[href^="/account/orders/"]`).click();
  await expect(page).toHaveURL(new RegExp(`/account/orders/${ids.seedOrderNumber}$`));

  // Seed: tam 1 kalem (e2e-mug).
  await expect(page.getByTestId("order-detail-line")).toHaveCount(1);
  await expect(page.getByText(new RegExp(ids.simpleProduct.title, "i"))).toBeVisible();
  await expect(page.getByTestId("order-detail-total")).toBeVisible();

  // Ham enum sızmamalı — durum yalnız çevrilmiş (Türkçe) etiketle görünür.
  await expect(page.locator("body")).not.toContainText(
    /\b(PAID|PENDING|UNPAID|FULFILLED|UNFULFILLED|CANCELLED|DRAFT)\b/,
  );
});
