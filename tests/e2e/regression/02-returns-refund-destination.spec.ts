import { test, expect, ids } from "../fixtures/test-base";

/**
 * TODO-176B (PR2) — "İadelerim" + refund destination (ORIGINAL_PAYMENT vs SHOPPING_BALANCE) invariant.
 *
 * TODO-175 (ADR-285): refundDestination müşterinin submit anında seçtiği IMMUTABLE snapshot'tır (admin
 * değiştiremez). İki seed iade farklı hedef + farklı statü taşır. Test bu snapshot'ın müşteri "İadelerim"
 * yüzeyinde DOĞRU ve AYRIŞMIŞ (raw enum değil lokalize) gösterildiğini kanıtlar:
 *   - e2e-return-1001 → "Alışveriş bakiyesine" + "Talep alındı"
 *   - e2e-return-1002 → "Orijinal ödeme yöntemine" + "Onaylandı"
 *
 * Müşteri iade listesi sorgusu status-filtresizdir (yalnız storeId+customerId) → read-only, deterministik,
 * bağımsız. @regression (lifecycle; smoke gate dışında).
 */

test("@regression returns list reflects immutable refund destination + status per return", async ({
  page,
}) => {
  await page.goto("/account/returns");

  await expect(page.getByRole("heading", { name: "İadelerim" })).toBeVisible();

  for (const r of ids.returns) {
    // İade kartını referans numarasıyla daralt (kart bir <a> link).
    const card = page.locator("a", { hasText: r.number });
    await expect(card).toBeVisible();
    // Refund hedefi IMMUTABLE snapshot'tan lokalize gösterilir (ORIGINAL vs SHOPPING_BALANCE ayrışır).
    await expect(card).toContainText(r.destinationText);
    // Statü rozeti lokalize (raw ReturnStatus enum sızmaz).
    await expect(card).toContainText(r.statusText);
  }

  // Ham enum sızmamalı — hedef/statü yalnız lokalize etiketle görünür.
  await expect(page.locator("body")).not.toContainText(
    /\b(SHOPPING_BALANCE|ORIGINAL_PAYMENT|REQUESTED|APPROVED|REFUND)\b/,
  );
});
