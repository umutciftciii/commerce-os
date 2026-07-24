/**
 * TODO-160 (ADR-102) — Influencer tracking route: `/t/:token`.
 *
 * Akış (SUNUCU-tarafı, click gecikmesi minimum):
 *  1. Opak ziyaretçi kimliği (commerce_os_vid) okunur ya da üretilir.
 *  2. Gateway'e click kaydı için POST (gerçek tarayıcı UA/referer/IP forward edilir).
 *  3. Gateway imzalı grant + güvenli hedef döner (invalid/expired → null → fallback "/").
 *  4. Grant varsa first-party attribution cookie yazılır (httpOnly + lax + prod-secure).
 *  5. `safeNextPath` ile doğrulanmış store-içi hedefe redirect (OPEN-REDIRECT YOK).
 *
 * Click yazımı başarısız olsa bile redirect DEVAM EDER (gateway null → "/"). Token/secret
 * loglanmaz. Cookie yazımı NextResponse üzerinden yapılır (route handler kuralı).
 */
import { NextResponse, type NextRequest } from "next/server";
import { demoStoreSlug } from "../../../lib/server/env";
import { safeNextPath } from "../../../lib/next-path";
import { postTrackClick } from "../../../lib/server/tracking";
import {
  ATTRIBUTION_COOKIE,
  VISITOR_COOKIE,
  VISITOR_COOKIE_MAX_AGE,
  generateVisitorId,
} from "../../../lib/server/attribution-cookie";

export const dynamic = "force-dynamic";

function clientIp(request: NextRequest): string | null {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip");
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  const { token } = await params;
  const origin = request.nextUrl.origin;

  const existingVid = request.cookies.get(VISITOR_COOKIE)?.value;
  const visitorId = existingVid && /^[A-Za-z0-9_-]{8,64}$/.test(existingVid) ? existingVid : generateVisitorId();

  const result = await postTrackClick(demoStoreSlug(), token, {
    userAgent: request.headers.get("user-agent"),
    referer: request.headers.get("referer"),
    ip: clientIp(request),
    visitorId,
  });

  // Güvenli hedef: yalnız store-içi tek-slash yol; aksi halde ana sayfa.
  const target = safeNextPath(result?.targetPath, "/");
  const response = NextResponse.redirect(new URL(target, origin));

  const secure = process.env.NODE_ENV === "production";
  // Ziyaretçi kimliğini tazele (opak; unique-visitor ölçümü için).
  response.cookies.set(VISITOR_COOKIE, visitorId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure,
    maxAge: VISITOR_COOKIE_MAX_AGE,
  });
  // Last-click: geçerli grant mevcut attribution'ı EZER. Grant null (pasif/pencere-dışı)
  // → cookie'ye DOKUNMA (mevcut attribution korunur; direct ziyaret gibi).
  if (result?.grant) {
    response.cookies.set(ATTRIBUTION_COOKIE, result.grant, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure,
      maxAge: Math.max(60, result.cookieMaxAgeSeconds),
    });
  }
  return response;
}
