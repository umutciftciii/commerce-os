import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { setSessionCookie } from "../../../../lib/server/session";
import { badRequestResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Store Admin login proxy (Faz E1 cutover). Gateway'in GERÇEK StoreUser login'ini
 * (`/auth/store/login`) çağırır — PlatformUser login'i DEĞİL, fallback YOK. Tenant
 * sunucu-tarafı deployment config'inden çözülür (gövde/başlık tenant TAŞIMAZ; istemci
 * mağaza SEÇEMEZ). Başarıda bearer token httpOnly cookie'ye yazılır; istemciye SADECE
 * güvenli kullanıcı DTO'su döner (token yanıt gövdesine/log'a yazılmaz, parola loglanmaz).
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown; rememberMe?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequestResponse();
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  // ADR-271 — "Beni hatırla" (server-otoriter oturum penceresi). Varsayılan KAPALI.
  const rememberMe = body.rememberMe === true;

  try {
    const result = await createApiClient().storeAuth.login({ email, password, rememberMe });
    const response = NextResponse.json({ user: result.user });
    setSessionCookie(response, result.token, result.expiresAt, rememberMe);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
