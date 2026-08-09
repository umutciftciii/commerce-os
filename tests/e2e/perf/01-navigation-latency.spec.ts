import { test, expect } from "../fixtures/test-base";

/**
 * PERF-001 — Vitrin navigasyon gecikmesi için KABA (gross) regresyon muhafızı.
 *
 * Amaç: yerel/dev runtime'da tekrar 4-5 saniyelik ciddi navigasyon gecikmesi
 * oluşursa bunu SESSİZCE geçirmemek. Bu, production observability'nin yerine
 * geçmez; yalnız kaba bir wall-clock regresyon kapısıdır.
 *
 * Tasarım kararları (flaky olmadan anlamlı olması için):
 *  1. WARM-UP: e2e stack `next dev`'e karşı koşar; her rota İLK hit'te derlenir
 *     (compile-on-first-hit, saniyeler). Cold compile bu görevde AYRI kabul
 *     edilir; bu yüzden ölçümden ÖNCE her rota bir kez gezilerek derlenir ve
 *     ölçüm yalnız WARM navigasyonu kapsar.
 *  2. MEDIAN: her akış N kez ölçülür ve MEDIAN bütçeyle kıyaslanır. Tek seferlik
 *     bellek-baskısı/GC spike'ı (ör. paylaşılan CI runner'ında) median'ı bozmaz,
 *     ama SÜREKLİ bir 4-5 sn regresyon her koşuda bütçeyi aşar → yakalanır.
 *  3. CÖMERT BÜTÇE: varsayılan 6000ms. Sağlıklı warm dev navigasyonu (~1.5-2.5s
 *     yerelde) rahatça geçer; eski ~5s+ regresyon başı derde sokar. CI donanımı
 *     için `PERF_NAV_BUDGET_MS` ile override edilebilir.
 *  4. Required smoke gate'in DIŞINDA: ayrı `perf` projesi + `@perf` tag (bkz.
 *     playwright.config.ts). `pnpm e2e:perf` ile manuel/nightly koşar; PR smoke
 *     süresini büyütmez ve wall-clock varyansı merge'i bloke etmez.
 */

const BUDGET_MS = Number(process.env.PERF_NAV_BUDGET_MS ?? 6000);
const RUNS = 3;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const cardLink = (page: import("@playwright/test").Page) =>
  page.getByTestId("product-card").first().locator('a[href*="/products/"]').first();

test("@perf vitrin warm navigasyon gecikmesi bütçe içinde", async ({ page }) => {
  const home: number[] = [];
  const plp: number[] = [];
  const pdpClick: number[] = [];

  // --- Warm-up: home + PLP + PDP rotalarını derle (compile ölçüm DIŞI). ---------
  await page.goto("/", { waitUntil: "load" });
  await page.goto("/products", { waitUntil: "load" });
  await expect(cardLink(page)).toBeVisible();
  const warmHref = await cardLink(page).getAttribute("href");
  expect(warmHref, "PLP en az bir ürün kartı linki üretmeli").toBeTruthy();
  await page.goto(warmHref!, { waitUntil: "load" });
  await expect(page.getByTestId("buybox-price")).toBeVisible();

  // --- Ölçüm: her akış RUNS kez (yalnız warm). ---------------------------------
  for (let i = 0; i < RUNS; i++) {
    // A) Home kaba yükleme.
    let started = Date.now();
    await page.goto("/", { waitUntil: "load" });
    await expect(page.locator("#main")).toBeVisible();
    home.push(Date.now() - started);

    // B) PLP kaba yükleme.
    started = Date.now();
    await page.goto("/products", { waitUntil: "load" });
    await expect(cardLink(page)).toBeVisible();
    plp.push(Date.now() - started);

    // C) PLP → PDP istemci navigasyonu — kullanıcının bildirdiği tam akış
    //    ("ürün kartına tıkla → PDP açılsın"). Tıklama → BuyBox fiyatı görünür.
    started = Date.now();
    await cardLink(page).click();
    await expect(page.getByTestId("buybox-price")).toBeVisible();
    pdpClick.push(Date.now() - started);
  }

  const med = { home: median(home), plp: median(plp), pdpClick: median(pdpClick) };
  // Rapor için görünür (list reporter): median değerleri + bütçe.
  console.log(
    `[perf] median ms — home=${med.home} plp=${med.plp} pdpClick=${med.pdpClick} (budget=${BUDGET_MS}) ` +
      `raw home=${home} plp=${plp} pdpClick=${pdpClick}`,
  );

  expect(med.home, `home warm yükleme median ${med.home}ms > ${BUDGET_MS}ms`).toBeLessThan(BUDGET_MS);
  expect(med.plp, `PLP warm yükleme median ${med.plp}ms > ${BUDGET_MS}ms`).toBeLessThan(BUDGET_MS);
  expect(
    med.pdpClick,
    `PLP→PDP tıklama navigasyonu median ${med.pdpClick}ms > ${BUDGET_MS}ms`,
  ).toBeLessThan(BUDGET_MS);
});
