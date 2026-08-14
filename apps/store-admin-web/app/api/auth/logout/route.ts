import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { clearSessionCookie, getSessionToken } from "../../../../lib/server/session";
import { csrfForbiddenResponse } from "../../../../lib/server/respond";
import { isValidCsrfRequest, clearCsrfCookie } from "../../../../lib/server/csrf";

export const dynamic = "force-dynamic";

/** Oturumu kapatir. CSRF korumali; cookie her durumda temizlenir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) {
    return csrfForbiddenResponse();
  }
  const token = getSessionToken(request);
  if (token) {
    // Faz E1 cutover — GERÇEK StoreUser oturumunu revoke eder (`/auth/store/logout`);
    // PlatformUser logout DEĞİL. Platform Admin oturumu/logout'u etkilenmez.
    await createApiClient().storeAuth.logout(token).catch(() => {
      // Gateway revoke basarisiz olsa bile yerel cookie temizlenir.
    });
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  clearCsrfCookie(response); // S4 — CSRF cookie'sini de temizle (yetim token birakma).
  return response;
}
