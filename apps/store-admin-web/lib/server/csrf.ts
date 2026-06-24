import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

/**
 * Double-submit CSRF korumasi (mutating BFF route'lari icin). Cookie + eslesen
 * header zorunlu; admin-web ile ayni desen. Cookie adi store-admin'e ozeldir.
 */
export const CSRF_COOKIE_NAME =
  process.env.STORE_ADMIN_CSRF_COOKIE_NAME ?? "commerce_os_store_admin_csrf";
export const CSRF_HEADER_NAME = process.env.ADMIN_CSRF_HEADER_NAME ?? "x-commerce-os-csrf";

const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_SECURE =
  process.env.ADMIN_COOKIE_SECURE === undefined ? IS_PROD : process.env.ADMIN_COOKIE_SECURE === "true";
const COOKIE_SAME_SITE = process.env.ADMIN_COOKIE_SAME_SITE === "strict" ? "strict" : "lax";

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}

export function setCsrfCookie(response: NextResponse, token: string): void {
  response.cookies.set({
    name: CSRF_COOKIE_NAME,
    value: token,
    httpOnly: false,
    sameSite: COOKIE_SAME_SITE,
    secure: COOKIE_SECURE,
    path: "/",
    maxAge: 60 * 60 * 8,
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
