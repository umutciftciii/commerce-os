import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * TODO-176 (Task 6) — Paylasilan sepet sifirlama yardimcisi.
 *
 * Auth musteri sepeti sunucu/DB tabanlidir (cart-actions.ts hasCustomerSession() dalinda);
 * bu yuzden bir testte eklenen kalem, ayni storageState'i paylasan sonraki testte de
 * KALICIDIR. Smoke suite'teki sepet testlerini izole etmek icin her testin basinda
 * sepeti bosaltmak GEREKIR.
 *
 * `/cart`'a gider, `cart-line` kalmayana kadar ilk `cart-line-remove`'a tiklar (web-first
 * bekleme: `toHaveCount` polling; sleep/waitForTimeout YOK). Sepet zaten bossa (empty-state,
 * hic `cart-line` yok) sorunsuz doner.
 */
export async function clearCart(page: Page): Promise<void> {
  await page.goto("/cart");

  const lines = page.getByTestId("cart-line");
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const count = await lines.count();
    if (count === 0) break;
    await lines.first().getByTestId("cart-line-remove").click();
    await expect(lines).toHaveCount(count - 1);
  }

  await expect(lines).toHaveCount(0);
}
