import type { NextRequest, NextResponse } from "next/server";
import { optionalEnvString, resolveCookieSecure, resolveSameSite } from "@commerce-os/utils";

/**
 * Server-side oturum cookie yardimcilari (BFF/proxy katmani).
 *
 * Faz E1/E2/F cutover TAMAM: cookie GERÇEK bir StoreUser oturum token'ı taşır (ADR-271
 * store-auth: `/auth/store/{login,session,logout,extend}`). Platform-admin bearer proxy /
 * geçici demo-katalog yolu KALDIRILDI — PlatformUser fallback / identity-bridge YOK. Token
 * httpOnly cookie'de SERVER tarafında saklanır; istemci JS'ine, UI'a veya log'a düşmez.
 * Tarayıcı yalnızca aynı-origin /api/* uçlarını çağırır ve cookie otomatik gönderilir. Faz F
 * extend rotation sonrası bu cookie YENİ token ile atomik yeniden yazılır (setSessionCookie).
 *
 * Cookie adi admin-web'den ayridir; iki panel ayni host'ta farkli portlarda
 * calissa bile oturumlar karismaz.
 */
// TD-038: bos/whitespace env "yok" sayilir; bos cookie adi uretmez.
export const SESSION_COOKIE_NAME =
  optionalEnvString(process.env.STORE_ADMIN_SESSION_COOKIE_NAME) ?? "commerce_os_store_admin_session";

// S5 — ortak güvenli parser (session + CSRF AYNI env/resolver; prod'da insecure fail-fast).
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_SECURE = resolveCookieSecure(process.env.ADMIN_COOKIE_SECURE, {
  isProduction: IS_PROD,
  envName: "ADMIN_COOKIE_SECURE",
});
const COOKIE_SAME_SITE = resolveSameSite(process.env.ADMIN_COOKIE_SAME_SITE);

export function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

/**
 * ADR-271 — Oturum cookie'si. rememberMe ACIK → KALICI (expires = gateway'in
 * absolute deadline'i); KAPALI → SESSION cookie (tarayici kapaninca gider).
 * Gerçek geçerlilik her durumda SERVER-otoriter (idle+absolute).
 */
export function setSessionCookie(
  response: NextResponse,
  token: string,
  expiresAt: string,
  rememberMe: boolean,
): void {
  const expires = new Date(expiresAt);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE,
    path: "/",
    ...(rememberMe && !Number.isNaN(expires.getTime()) ? { expires } : {}),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: 0,
  });
}
