import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { optionalEnvString, resolveCookieSecure, resolveSameSite } from "@commerce-os/utils";

// TD-038: bos/whitespace env "yok" sayilir; bos cookie/header adi uretmez.
export const CSRF_COOKIE_NAME =
  optionalEnvString(process.env.ADMIN_CSRF_COOKIE_NAME) ?? "commerce_os_admin_csrf";
export const CSRF_HEADER_NAME =
  optionalEnvString(process.env.ADMIN_CSRF_HEADER_NAME) ?? "x-commerce-os-csrf";

// S5 — session cookie ile AYNI güvenli resolver + AYNI env (parity).
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_SECURE = resolveCookieSecure(process.env.ADMIN_COOKIE_SECURE, {
  isProduction: IS_PROD,
  envName: "ADMIN_COOKIE_SECURE",
});
const COOKIE_SAME_SITE = resolveSameSite(process.env.ADMIN_COOKIE_SAME_SITE);

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function setCsrfCookie(response: NextResponse, token: string): void {
  // ADR-271 — SESSION cookie (sabit 8 saat maxAge KALDIRILDI; politikadan bagimsiz
  // drift onlenir). Double-submit token'i istemci bellekte (tab omru) tutar ve
  // gerektiginde /api/auth/csrf'ten yeniler; kalici oturumda (rememberMe) tarayici
  // yeniden acilinca token yeniden alinir.
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: false,
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE,
    path: "/",
  });
}

// S4 (post-audit) — logout/oturum sonlaninca CSRF cookie'sini de temizle (session cookie ile AYNI
// path/sameSite/secure/name options → tarayici gercekten siler). Aksi halde yetim CSRF token kalir.
export function clearCsrfCookie(response: NextResponse): void {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: "",
    httpOnly: false,
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: 0,
  });
}

export function isValidCsrfRequest(request: NextRequest): boolean {
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  if (!cookieToken || !headerToken) return false;

  const cookieBuffer = Buffer.from(cookieToken);
  const headerBuffer = Buffer.from(headerToken);
  return cookieBuffer.length === headerBuffer.length && timingSafeEqual(cookieBuffer, headerBuffer);
}
