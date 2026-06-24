import type { NextRequest, NextResponse } from "next/server";

/**
 * Server-side oturum cookie yardimcilari (BFF/proxy katmani).
 *
 * Demo asamasinda store-admin-web, platform admin bearer token'i ile gateway'in
 * gecici platform-admin korumali katalog uclarini cagirir (store-user auth henuz
 * tam degil — bkz. docs/TECHNICAL_DEBT.md). Token httpOnly cookie'de SERVER
 * tarafinda saklanir; istemci JS'ine, UI'a veya log'a dusmez. Tarayici yalnizca
 * ayni-origin /api/* uclarini cagirir ve cookie otomatik gonderilir.
 *
 * Cookie adi admin-web'den ayridir; iki panel ayni host'ta farkli portlarda
 * calissa bile oturumlar karismaz.
 */
export const SESSION_COOKIE_NAME =
  process.env.STORE_ADMIN_SESSION_COOKIE_NAME ?? "commerce_os_store_admin_session";

const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_SECURE =
  process.env.ADMIN_COOKIE_SECURE === undefined ? IS_PROD : process.env.ADMIN_COOKIE_SECURE === "true";
const COOKIE_SAME_SITE = parseSameSite(process.env.ADMIN_COOKIE_SAME_SITE);

function parseSameSite(value: string | undefined): "lax" | "strict" {
  return value === "strict" ? "strict" : "lax";
}

export function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(SESSION_COOKIE_NAME)?.value ?? null;
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string): void {
  const expires = new Date(expiresAt);
  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE,
    path: "/",
    expires: Number.isNaN(expires.getTime()) ? undefined : expires,
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
