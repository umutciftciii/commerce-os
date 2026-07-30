import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../lib/server/session";
import { errorResponse, unauthorizedResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-164 — Platform Admin "Tema Yönetimi" fleet listesi. Tüm mağazalar + yayınlı
 * tema özeti (aktif tema/preset/uyumluluk/capability). Auth gateway'de platform-admin.
 */
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) return unauthorizedResponse();
  try {
    return NextResponse.json(await createApiClient().admin.themeBindings.list(token));
  } catch (error) {
    return errorResponse(error);
  }
}
