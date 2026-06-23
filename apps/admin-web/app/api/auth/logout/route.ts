import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { getSessionToken, clearSessionCookie } from "../../../../lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Oturumu kapatir. Cookie her durumda temizlenir; gateway revoke cagrisi
 * best-effort yapilir (hata olsa bile istemci oturumu sonlanir).
 */
export async function POST(request: NextRequest) {
  const token = getSessionToken(request);
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  if (token) {
    try {
      await createApiClient().auth.platformLogout(token);
    } catch {
      // Best-effort revoke; cookie zaten temizlendi.
    }
  }
  return response;
}
