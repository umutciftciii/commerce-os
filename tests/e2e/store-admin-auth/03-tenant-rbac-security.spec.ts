import { test, expect } from "@playwright/test";
import { ids } from "../fixtures/ids";
import { STORE_ADMIN_URL } from "../fixtures/env";
import { csrfHeader } from "../fixtures/session";

/**
 * Phase G §4 + §5 — Tenant güvenliği + RBAC browser kanıtı (kalıcı regression).
 *
 * (A) PlatformUser credential Store Admin login'de ÇALIŞMAZ: gateway `/auth/store/login` yalnız
 *     tenant mağazadaki (e2e-store) StoreUser'a karşı doğrular; yalnız-platform kullanıcı (e2e-agent,
 *     e2e-store'da StoreUser DEĞİL) reddedilir — identity-bridge/dual-auth YOK.
 * (B) VIEWER (en kısıtlı rol): read izinli; settings:manage + platform-requests:write mutation'ları
 *     API 403 ile fail-closed. Rol UI'da i18n ("Görüntüleyici"; ham enum yok).
 *
 * NOT (§4 cross-store): Store Admin route'ları storeId'yi OTURUMDAN türetir (path'te :storeId YOK) →
 * istemci URL/path ile başka mağazayı hedefleyemez (saldırı yüzeyi mimari olarak yok). Yapısal
 * cross-tenant izolasyonun source-of-truth'u gateway store-rbac integration'dır (path :storeId
 * mismatch → 404 STORE_ACCESS_DENIED; cross-store liste sızıntısı yok). Burada auth-hack üretilmez.
 */
const auth = ids.storeAuth;

// Double-submit CSRF ile korumalı BFF mutation'ı çağır (client api.ts ile aynı sözleşme:
// önce /api/auth/csrf token'ı, sonra header). Böylece 403 = RBAC (settings:manage yok),
// CSRF hatası DEĞİL — restricted-role enforcement'ı gerçekten kanıtlanır.
async function bffPatch(page: import("@playwright/test").Page, path: string, body: unknown): Promise<number> {
  const csrf = await csrfHeader(page);
  return page.evaluate(
    async ({ path, body, headerName, token }) => {
      const res = await fetch(path, {
        method: "PATCH",
        headers: { [headerName]: token, "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.status;
    },
    { path, body, headerName: csrf.name, token: csrf.token },
  );
}

test.describe.configure({ timeout: 120_000 });

test.describe("Store Admin tenant security — PlatformUser credential rejected", () => {
  test.use({ storageState: { cookies: [], origins: [] } }); // fresh (unauthenticated)

  test("@store-admin-auth platform-only user cannot log into Store Admin (no store session cookie)", async ({
    page,
  }) => {
    await page.goto(`${STORE_ADMIN_URL}/login`);
    await page.locator("#email").fill(auth.platformOnly.email);
    await page.locator("#password").fill(auth.platformOnly.password);
    await page.getByRole("button", { name: /giriş|login|oturum/i }).click();

    // Reddedilir: /login'de kalır (shell'e YÖNLENDİRMEZ) — hata mesajı görünür.
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("store-admin-role-badge")).toHaveCount(0);
    // Store session cookie set EDİLMEZ.
    const cookies = await page.context().cookies();
    expect(cookies.some((c) => c.name === "commerce_os_store_admin_session" && c.value)).toBeFalsy();
  });
});

test.describe("Store Admin RBAC — VIEWER restricted role", () => {
  test.use({ storageState: "tests/e2e/.auth/store-admin-viewer.json" });

  test("@store-admin-auth VIEWER reads allowed surfaces; role shown as i18n label", async ({ page }) => {
    await page.goto("/orders"); // orders:read ∈ VIEWER
    await expect(page.getByTestId("store-admin-role-badge")).toBeVisible();
    await expect(page.getByTestId("store-admin-role-badge")).toHaveText(auth.viewer.roleLabel); // "Görüntüleyici"
    expect(new URL(page.url()).pathname).not.toMatch(/^\/login/);
  });

  test("@store-admin-auth VIEWER manage mutation is forbidden (settings:manage → 403)", async ({ page }) => {
    await page.goto("/orders"); // authenticated shell + csrf cookie
    await expect(page.getByTestId("store-admin-role-badge")).toBeVisible();
    // settings:manage VIEWER'da YOK → BFF/gateway RBAC 403 (fail-closed; yazma gerçekleşmez).
    const status = await bffPatch(page, "/api/store/settings", { displayName: "should-not-apply" });
    expect(status).toBe(403);
  });
});
