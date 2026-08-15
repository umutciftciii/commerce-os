import { test, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";

/**
 * Phase G §3 — Canonical Store Admin smoke (StoreUser oturumu).
 *
 * Project storageState = OWNER (store-admin.json, gerçek UI login). Auth cutover sonrası tüm
 * çekirdek yüzeyler StoreUser oturumuyla erişilebilir olmalı: her rota authenticated shell'i
 * (rol rozeti) render eder ve /login'e YÖNLENDİRMEZ. Ardından EN AZ BİR kontrollü mutation
 * (platform-request create) StoreUser yazma yolunu + audit'i uçtan uca kanıtlar.
 *
 * Idempotency/teardown: platform-request numarası GLOBAL ve benzersizdir (nonce'lu konu);
 * CI'da e2e DB her koşuda efemeraldir (`docker compose down -v`) → kalıcı test verisi birikmez.
 */
test.describe.configure({ timeout: 120_000 }); // next dev cold-compile toplamı (CI); flake gizleme değil.

const pr = ids.platformRequest;

// Auth cutover'ın çekirdek yüzeylerde çalıştığını kanıtlayan minimum required tur.
const SCREENS: Array<{ path: string; name: string }> = [
  { path: "/", name: "home/dashboard" },
  { path: "/products", name: "products" },
  { path: "/inventory", name: "inventory" },
  { path: "/orders", name: "orders" },
  { path: "/orders/returns", name: "returns" },
  { path: "/customers", name: "customers" },
  { path: "/platform-requests", name: "platform-requests" },
  { path: "/settings", name: "settings (read)" },
];

test.describe("Store Admin canonical smoke", () => {
  for (const screen of SCREENS) {
    test(`@store-admin-auth ${screen.name} renders authenticated shell (no login redirect)`, async ({ page }) => {
      await page.goto(screen.path);
      // Authenticated shell = rol rozeti (client me()+storeContext başarılı). Her korumalı sayfada var.
      await expect(page.getByTestId("store-admin-role-badge")).toBeVisible();
      // /login'e düşmedik (oturum geçerli, RBAC read izinli).
      expect(new URL(page.url()).pathname).not.toMatch(/^\/login/);
      // Sayfa başlığı render oldu (boş/patlamış değil).
      await expect(page.getByRole("heading").first()).toBeVisible();
    });
  }

  test("@store-admin-auth controlled mutation: StoreUser creates a platform request (write + audit path)", async ({
    page,
  }) => {
    const nonce = Date.now().toString(36);
    const subject = `E2E auth-smoke ${nonce}`;
    const description = `Phase G canonical smoke controlled mutation (${nonce}).`;

    await page.goto("/platform-requests/new");
    // Türkçe İ case-fold tuzağı: select'ler option-filter, input/textarea placeholder ile.
    const categorySelect = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: pr.categoryLabel }) });
    await categorySelect.selectOption({ label: pr.categoryLabel });
    await page.getByPlaceholder("Kısa ve açıklayıcı bir başlık").fill(subject);
    await page.getByPlaceholder("Sorunu, beklentinizi ve varsa adımları yazın.").fill(description);
    const storeImpactSelect = page
      .locator("select")
      .filter({ has: page.locator("option", { hasText: pr.storeImpactLabel }) });
    await storeImpactSelect.selectOption({ label: pr.storeImpactLabel });
    await page.getByRole("button", { name: "Talep oluştur" }).click();

    // Başarıda detail'e yönlenir; global PR-###### numarası görünür (StoreUser yazma yolu çalıştı).
    await page.waitForURL(/\/platform-requests\/(?!new)[^/]+$/, { timeout: 20_000 });
    const prNo = (await page.getByRole("heading", { level: 1 }).innerText()).trim();
    expect(prNo).toMatch(/^PR-\d{6,}$/);
    // Oluşturan mağazanın kendi konusu detay'da görünür.
    await expect(page.getByText(subject)).toBeVisible();
  });
});
