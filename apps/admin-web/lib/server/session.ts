import type { NextRequest, NextResponse } from "next/server";

/**
 * Server-side oturum cookie yardimcilari (BFF/proxy katmani).
 *
 * Faz 1B gecici strateji: platform admin bearer token'i httpOnly cookie'de
 * SERVER tarafinda saklanir. Token hicbir zaman istemci JS'ine, UI'a veya
 * log'a dusmez; tarayici yalnizca ayni-origin /api/* uclarini cagirir ve cookie
 * otomatik gonderilir. Production hardening (CSRF, secure flag matrisi, refresh
 * rotasyonu) bilincli olarak sonraki faza birakildi (bkz. docs/TECHNICAL_DEBT.md
 * TD-015, docs/DECISIONS.md ADR-017).
 */
const COOKIE_NAME = process.env.ADMIN_AUTH_COOKIE_NAME ?? "commerce_os_admin_session";
const IS_PROD = process.env.NODE_ENV === "production";

export function getSessionToken(request: NextRequest): string | null {
  return request.cookies.get(COOKIE_NAME)?.value ?? null;
}

export function setSessionCookie(response: NextResponse, token: string, expiresAt: string): void {
  const expires = new Date(expiresAt);
  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    expires: Number.isNaN(expires.getTime()) ? undefined : expires,
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PROD,
    path: "/",
    maxAge: 0,
  });
}
