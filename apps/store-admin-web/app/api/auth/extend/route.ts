import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Store Admin oturum "uzatma" (Faz E1). Gateway StoreUser token ROTATION ucu
 * (`/auth/store/extend`) HENÜZ YOK — Phase B'de bilinçli olarak Faz F'e ertelendi.
 * Bu nedenle E1'de extend, GERÇEK StoreUser session ucundan (`/auth/store/session`)
 * server-otoriter zamanlamayı yeniden okur (rotation/cookie yeniden-yazımı YOK): SessionGuard
 * bu timing ile istemci idle-penceresini yeniden çıpalar; oturumun gerçek geçerliliği her
 * durumda SUNUCU-otoriterdir. Token rotation'lı gerçek extend Faz F'te eklenecek (StoreUser
 * → SAHTE PlatformUser token / identity-bridge ÜRETİLMEZ). CSRF korumalı.
 */
export async function POST(request: NextRequest) {
  const token = getSessionToken(request);
  if (!isValidCsrfRequest(request)) {
    return csrfForbiddenResponse();
  }
  if (!token) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
  }
  try {
    const result = await createApiClient().storeAuth.session(token);
    return NextResponse.json({ timing: result.session.timing });
  } catch (error) {
    return errorResponse(error);
  }
}
