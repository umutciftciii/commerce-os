import type { NextRequest, NextResponse } from "next/server";
import { optionalEnvString } from "@commerce-os/utils";

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
