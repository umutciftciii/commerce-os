import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { clearSessionCookie, getSessionToken } from "../../../../lib/server/session";
import { errorResponse, unauthorizedResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Aktif Store Admin oturumunu doğrular (Faz E1 cutover). Gateway'in GERÇEK StoreUser
 * session ucunu (`/auth/store/session`) çağırır — PlatformUser `me` DEĞİL. Yanıt
 * StoreUser principal + oturumun bağlı olduğu mağaza (store context, server-otoriter)
 * + oturum zamanlamasını taşır. Cookie yoksa 401; gateway 401 dönerse cookie temizlenir.
 */
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) {
    return unauthorizedResponse();
  }
  try {
    const me = await createApiClient().storeAuth.session(token);
    return NextResponse.json(me);
  } catch (error) {
    const response = errorResponse(error);
    if (response.status === 401) {
      clearSessionCookie(response);
    }
    return response;
  }
}
