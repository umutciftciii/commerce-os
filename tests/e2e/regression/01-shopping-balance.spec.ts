import { test, expect, ids } from "../fixtures/test-base";

/**
 * TODO-176B (PR2) — "Alışveriş Bakiyem" finansal görünürlük + hareket invariant'ı.
 *
 * Finansal assertion (yalnız UI görünürlüğü DEĞİL, gerçek sonuç): gösterilen kullanılabilir
 * bakiye == seed'lenen goodwill grant tutarı (₺1.000,00) ve hareket listesinde grant'in CREDIT
 * satırı (+₺1.000,00, semantik `credit.goodwill` → TR copy) görünür. Sunucu-otoriter:
 * `getShoppingBalance` → gateway `getCustomerBalance` ACTIVE lot'ların kalanından hesaplar.
 *
 * STORE_CREDIT ASLA nakit değildir: bu bir mağaza bakiyesidir, "iade/para çekme" değil — sayfa
 * yalnızca bakiye + hareket gösterir (nakde çevirme aksiyonu YOKTUR). Read-only → deterministik,
 * bağımsız (append-only ledger'ı mutasyona uğratmaz).
 *
 * @regression (finansal lifecycle; smoke gate dışında).
 */

test("@regression shopping balance shows granted credit + immutable movement", async ({ page }) => {
  const c = ids.goodwillCredit;

  await page.goto("/account?section=balance");

  // Başlık göründü (doğru bölüm).
  await expect(page.getByRole("heading", { name: "Alışveriş Bakiyem" })).toBeVisible();

  // Finansal invariant: kullanılabilir bakiye == grant (₺1.000,00). "Kullanılabilir Bakiyeniz"
  // etiketli blokta gösterilir; ham enum/kod değil lokalize tutar.
  await expect(page.getByText(`₺${c.availableText}`).first()).toBeVisible();

  // Hareket: goodwill CREDIT satırı (+ işaretli, semantik key TR karşılığı). Bu satır IMMUTABLE
  // (append-only ledger) → başka bir hareket olsa bile bu grant hareketi HER ZAMAN görünür.
  await expect(page.getByText(c.movementText)).toBeVisible();
  await expect(page.getByText(`+₺${c.availableText}`)).toBeVisible();
});
