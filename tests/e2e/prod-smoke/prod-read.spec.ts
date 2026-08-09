import { test, expect } from "@playwright/test";
import { requiredEnv } from "../fixtures/env";

/**
 * TODO-176 (Task 11) — Production post-deploy smoke (`@prod-smoke`).
 *
 * ANONIM, READ-ONLY, EXPLICIT hedef. `prod-smoke` projesinin (playwright.config.ts) storageState/setup
 * bagimliligi YOK — bu suite gercek/prod benzeri bir storefront'a karsi oturumsuz kosar. baseURL config'ten
 * gelir (`E2E_STOREFRONT_URL`); hicbir URL burada hardcode EDILMEZ.
 *
 * FAIL-LOUD: PDP hedefi (`E2E_PROD_PRODUCT_SLUG`) ZORUNLUDUR — `requiredEnv` eksikse acik config hatasi
 * firlatir (silent fallback YOK). Kategori/arama hedefleri (`E2E_PROD_CATEGORY_SLUG` /
 * `E2E_PROD_SEARCH_TERM`) OPSIYONEL — tanimsizsa test GORUNUR sekilde skip edilir (raporda gorunur;
 * sessizce gecilmez).
 *
 * Rota dogrulamasi (kaynaktan): kategori VE arama ayni `/products` PLP rotasini kullanir
 * (apps/storefront-web/app/products/page.tsx → parseServerSearchParams: `category` ve `q` query
 * parametreleri, bkz. lib/search/url-state.ts). `/t/:token` influencer tracking redirect'idir, kategori
 * DEGILDIR; `/discovery` yalnizca `/discovery/[sectionId]` viewer-specific bolumdur, genel arama DEGILDIR
 * — bu yuzden ikisi de KULLANILMAZ.
 */
const CATEGORY_SLUG = process.env.E2E_PROD_CATEGORY_SLUG?.trim();
const SEARCH_TERM = process.env.E2E_PROD_SEARCH_TERM?.trim();

test("@prod-smoke home renders without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));

  await page.goto("/");

  await expect(page).toHaveTitle(/.+/);
  expect(errors).toEqual([]);
});

test("@prod-smoke PDP renders for explicit target", async ({ page }) => {
  const slug = requiredEnv("E2E_PROD_PRODUCT_SLUG"); // zorunlu → yoksa acik config error (fail-loud)

  await page.goto(`/products/${slug}`);

  await expect(page.getByTestId("buybox-price")).toBeVisible();
  // Ham backend enum degeri sizmamali (UI her zaman cevrilmis/etiketlenmis metin gostermeli).
  await expect(page.locator("body")).not.toContainText(
    /\b(PAID|PENDING|UNPAID|FULFILLED|UNFULFILLED|CANCELLED|DRAFT)\b/,
  );
});

test("@prod-smoke PLP renders for explicit category", async ({ page }) => {
  test.skip(!CATEGORY_SLUG, "E2E_PROD_CATEGORY_SLUG tanimsiz → skipped (no silent fallback)");

  await page.goto(`/products?category=${encodeURIComponent(CATEGORY_SLUG!)}`);

  await expect(page.getByTestId("product-card").first()).toBeVisible();
});

test("@prod-smoke search works for explicit term", async ({ page }) => {
  test.skip(!SEARCH_TERM, "E2E_PROD_SEARCH_TERM tanimsiz → skipped (no silent fallback)");

  await page.goto(`/products?q=${encodeURIComponent(SEARCH_TERM!)}`);

  await expect(page.getByTestId("product-card").first()).toBeVisible();
});
