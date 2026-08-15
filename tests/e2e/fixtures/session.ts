import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "@playwright/test";
import type { SessionTiming } from "@commerce-os/contracts";
import { ids } from "./ids";
import { STORE_ADMIN_URL } from "./env";

/**
 * Faz F (ADR-271, §10 — Phase G Playwright prep) — Store Admin oturum yaşam-döngüsü fixture'ları.
 *
 * Phase G'nin oturum-UX senaryoları (uyarı → uzat → logout, süre dolunca login'e dönüş, çok-sekme)
 * için YENİDEN KULLANILABİLİR yardımcılar. Bu modül YALNIZ prep'tir: burada full browser regression
 * BÜYÜTÜLMEZ, prod-destructive smoke YOK. Deterministik StoreUser OWNER (`e2e-admin@example.test`,
 * ACTIVE, e2e-store) `packages/db/scripts/e2e-seed.mjs` tarafından sağlanır.
 */

export const STORE_ADMIN_SESSION_COOKIE = "commerce_os_store_admin_session";

/**
 * GERÇEK StoreUser UI login'i (store-admin-auth.setup.ts ile aynı akış; ad-hoc kullanım için
 * yeniden kullanılabilir helper). Login sonrası store-admin session cookie'sinin set edildiğini
 * doğrular. Tenant sunucu-tarafı (STORE_ADMIN_STORE_SLUG=e2e-store) — istemci tenant seçmez.
 */
export async function loginStoreAdmin(page: Page): Promise<void> {
  await page.goto(`${STORE_ADMIN_URL}/login`);
  await page.locator("#email").fill(ids.storeAdmin.email);
  await page.locator("#password").fill(ids.storeAdmin.password);
  await page.getByRole("button", { name: /giriş|login|oturum/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  const cookies = await page.context().cookies();
  expect(cookies.some((c) => c.name === STORE_ADMIN_SESSION_COOKIE)).toBeTruthy();
}

/** Sunucu-otoriter oturum zamanlamasını `/api/auth/me` üzerinden okur (SessionGuard'ın çıpası). */
export async function getSessionTiming(page: Page): Promise<SessionTiming> {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/me", { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`me ${res.status}`);
    const body = (await res.json()) as { session: { timing: SessionTiming } };
    return body.session.timing;
  });
}

/**
 * Double-submit CSRF token'ını client api.ts ile AYNI şekilde edinir: `/api/auth/csrf` token'ı
 * döndürür VE cookie'yi set eder (login akışı bunu kendiliğinden yapmaz). Header token == cookie
 * token olacağından `isValidCsrfRequest` geçer. Header adı sunucudan gelir (hardcode yok).
 */
export async function csrfHeader(page: Page): Promise<{ name: string; token: string }> {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/csrf");
    if (!res.ok) throw new Error(`csrf ${res.status}`);
    const body = (await res.json()) as { csrfToken: string; headerName: string };
    return { name: body.headerName, token: body.csrfToken };
  });
}

/**
 * Oturumu uzat (Faz F rotation). BFF `/api/auth/extend` double-submit CSRF ister → önce
 * `/api/auth/csrf`'ten token alınır (client sözleşmesiyle birebir), sonra header olarak gönderilir.
 * Yeni (rotate edilmiş) timing döner; session cookie gateway rotation'ıyla ATOMİK yeniden yazılır.
 */
export async function extendStoreAdminSession(page: Page): Promise<SessionTiming> {
  const csrf = await csrfHeader(page);
  return page.evaluate(
    async ({ headerName, token }) => {
      const res = await fetch("/api/auth/extend", { method: "POST", headers: { [headerName]: token } });
      if (!res.ok) throw new Error(`extend ${res.status}`);
      const body = (await res.json()) as { timing: SessionTiming };
      return body.timing;
    },
    { headerName: csrf.name, token: csrf.token },
  );
}

/**
 * Oturum-sonu simülasyonu (deterministik; 30dk idle beklemeden). İstemci session cookie'sini düşürür
 * → bir sonraki auth-korumalı istekte me() 401 → login'e yönlenir. Böylece "süre dolunca login'e
 * dönüş" ve çok-sekme "diğer tab bir sonraki istekte login'e gider" davranışı test edilebilir.
 *
 * NOT: Bu, cookie-kaybı yoluyla oturum-sonunu SİMÜLE eder. SUNUCU-tarafı gerçek idle/absolute expiry
 * Phase G'de SESSION_* env küçültülerek (gateway worktree stack) sürülür — bu helper onun yerine
 * geçmez, hızlı UX-yönlendirme assertion'ları içindir.
 */
export async function expireStoreAdminSession(context: BrowserContext): Promise<void> {
  const all = await context.cookies();
  await context.clearCookies();
  const keep = all.filter((c) => c.name !== STORE_ADMIN_SESSION_COOKIE);
  if (keep.length > 0) await context.addCookies(keep);
}
