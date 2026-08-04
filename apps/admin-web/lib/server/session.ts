import type { NextRequest, NextResponse } from "next/server";
import { optionalEnvString, resolveCookieSecure, resolveSameSite } from "@commerce-os/utils";

/**
 * Server-side oturum cookie yardimcilari (BFF/proxy katmani).
 *
 * Platform admin bearer token'i httpOnly cookie'de
 * SERVER tarafinda saklanir. Token hicbir zaman istemci JS'ine, UI'a veya
 * log'a dusmez; tarayici yalnizca ayni-origin /api/* uclarini cagirir ve cookie
 * otomatik gonderilir.
 *
 * TD-038: bos/whitespace env'ler "yok" sayilir; bos cookie adi uretmez.
 */
export const SESSION_COOKIE_NAME =
  optionalEnvString(process.env.ADMIN_SESSION_COOKIE_NAME) ??
  optionalEnvString(process.env.ADMIN_AUTH_COOKIE_NAME) ??
  "commerce_os_admin_session";

// S5 — ortak güvenli parser: boş/geçersiz env prod'da insecure ÜRETMEZ (fail-fast). Session + CSRF
// cookie AYNI env'i (ADMIN_COOKIE_SECURE / ADMIN_COOKIE_SAME_SITE) ve AYNI resolver'ı kullanır.
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
 * ADR-271 — Oturum cookie'si.
 *   - `rememberMe` ACIK  → KALICI cookie; `expires` = gateway'in dondurdugu
 *     absolute deadline (politikadan turer; BFF'te sabit YOK).
 *   - `rememberMe` KAPALI → SESSION cookie (expires/maxAge YOK) → tarayici
 *     kapaninca gider. Gercek gecerlilik her durumda SERVER-otoriter (idle+absolute);
 *     cookie yalniz tasiyicidir.
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
