import { test, expect } from "@playwright/test";
import {
  STORE_ADMIN_SESSION_COOKIE,
  csrfHeader,
  extendStoreAdminSession,
  loginStoreAdmin,
} from "../fixtures/session";

/**
 * Phase G §6 — Oturum yaşam-döngüsü (gerçek browser).
 *
 * login → session restore (reload) → extend (token ROTATION) → rotation sonrası kullanıcı OTURUMDA
 * kalır → logout → /login. Rotation'da httpOnly session cookie DEĞERİ değişir (yeni token); eski
 * token'ın replay reddi lower-layer (gateway integration + BFF unit) coverage'ında kanıtlıdır —
 * burada tekrar edilmez (browser httpOnly cookie'yi otomatik yönetir). Zaman-manipülasyonlu expiry
 * uyarısı deterministik kurulamadığı için (SESSION_* env prod pencereleri) SessionGuard unit +
 * gateway integration source-of-truth bırakılır — hard sleep KULLANILMAZ.
 */
test.use({ storageState: { cookies: [], origins: [] } });
test.describe.configure({ timeout: 120_000 });

async function sessionCookieValue(context: import("@playwright/test").BrowserContext): Promise<string | undefined> {
  const cookies = await context.cookies();
  return cookies.find((c) => c.name === STORE_ADMIN_SESSION_COOKIE)?.value;
}

test.describe("Store Admin session lifecycle", () => {
  test("@store-admin-auth login → restore → extend(rotation) → stays authed → logout → login", async ({ page }) => {
    // 1) login
    await loginStoreAdmin(page);
    await expect(page.getByTestId("store-admin-role-badge")).toBeVisible();
    const tokenAtLogin = await sessionCookieValue(page.context());
    expect(tokenAtLogin).toBeTruthy();

    // 2) session restore — reload, hâlâ oturumda (shell tekrar render).
    await page.reload();
    await expect(page.getByTestId("store-admin-role-badge")).toBeVisible();

    // 3) extend → token ROTATION. Yeni timing döner; session cookie yeni değere yeniden yazılır.
    const timing = await extendStoreAdminSession(page);
    expect(timing.warningLeadSeconds).toBeGreaterThanOrEqual(0);
    const tokenAfterExtend = await sessionCookieValue(page.context());
    expect(tokenAfterExtend).toBeTruthy();
    expect(tokenAfterExtend).not.toBe(tokenAtLogin); // cookie rotation

    // 4) rotation sonrası kullanıcı OTURUMDA kalır (yeni token /api/auth/me → 200; shell durur).
    await page.reload();
    await expect(page.getByTestId("store-admin-role-badge")).toBeVisible();
    const meStatus = await page.evaluate(async () => (await fetch("/api/auth/me")).status);
    expect(meStatus).toBe(200);

    // 5) logout → /login'e döner. (CSRF: client sözleşmesiyle /api/auth/csrf token'ı.)
    const csrf = await csrfHeader(page);
    await page.evaluate(
      async ({ headerName, token }) => {
        await fetch("/api/auth/logout", { method: "POST", headers: { [headerName]: token } });
      },
      { headerName: csrf.name, token: csrf.token },
    );
    await page.goto("/orders"); // korumalı sayfa → oturum yok → /login
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByTestId("store-admin-role-badge")).toHaveCount(0);
  });
});
