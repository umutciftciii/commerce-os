import { test, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";
import { loginStoreAdmin } from "../fixtures/session";

/**
 * Phase G §2 — GERÇEK StoreUser kimliği + shell + store context.
 *
 * Store Admin'e GERÇEK UI login (`/auth/store/login`, ADR-271 store-auth) yapılır; PlatformUser
 * storageState/token KULLANILMAZ. Doğrulananlar: login başarılı → shell → OWNER rolü (i18n "Sahip")
 * → doğru store context (session-derived; E2E Store / e2e-store) → ham iç kimlik alanları DOM'a
 * sızmaz. Bu spec fresh (unauthenticated) context ister → proje storageState'i devre dışı.
 */
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 }); // next dev cold-compile (CI); flake gizleme değil.

const auth = ids.storeAuth;

test.describe("Store Admin identity + shell + context", () => {
  test("@store-admin-auth real StoreUser login → shell, OWNER role, session-derived store, no raw ids", async ({
    page,
  }) => {
    await loginStoreAdmin(page); // gerçek UI login + session cookie doğrulaması

    // Shell yüklendi (client me()+storeContext): rol rozeti authenticated tüm sayfalarda vardır.
    const roleBadge = page.getByTestId("store-admin-role-badge");
    await expect(roleBadge).toBeVisible();
    await expect(roleBadge).toHaveText(auth.owner.roleLabel); // OWNER → "Sahip" (ham enum yok)

    // Store context SERVER-otoriter (oturumun bağlı olduğu mağaza; demo/first-store YOK).
    await expect(page.getByTestId("store-admin-store-name")).toHaveText(auth.storeName);
    await expect(page.getByTestId("store-admin-store-slug")).toHaveText(auth.storeSlug);
    await expect(page.getByTestId("store-admin-user-email")).toHaveText(auth.owner.email);

    // /login'de değiliz (shell'e yönlendik).
    expect(new URL(page.url()).pathname).not.toMatch(/^\/login/);

    // Ham iç kimlik alanları DOM'a sızmaz (güvenli DTO).
    const bodyText = await page.locator("body").innerText();
    for (const forbidden of auth.forbiddenIdKeys) {
      expect(bodyText).not.toContain(forbidden);
    }

    // /api/auth/me güvenli DTO: iç alanlar yanıt gövdesinde yok.
    const meRaw = await page.evaluate(async () => {
      const res = await fetch("/api/auth/me", { headers: { accept: "application/json" } });
      return { status: res.status, text: await res.text() };
    });
    expect(meRaw.status).toBe(200);
    for (const forbidden of auth.forbiddenIdKeys) {
      expect(meRaw.text).not.toContain(forbidden);
    }
  });
});
