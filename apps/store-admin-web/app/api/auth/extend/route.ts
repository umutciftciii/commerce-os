import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { getSessionToken, setSessionCookie } from "../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * ADR-271 (Faz F) — Store Admin oturum uzatma (extend). CSRF korumalı (double-submit).
 * Gateway StoreUser token'ını ROTATE eder (`/auth/store/extend`): absolute tavan DEĞİŞMEZ,
 * idle capası yenilenir; yeni token httpOnly cookie'ye ATOMİK yeniden yazılır (cookie kalıcılığı
 * yeni oturumun rememberMe'sine göre, gateway timing'inden türer). İstemciye SADECE zamanlama
 * (idle/absolute/lead) döner — raw token gövdeye ASLA yazılmaz. SessionGuard bu timing ile
 * istemci idle-penceresini yeniden çıpalar; oturumun gerçek geçerliliği her durumda
 * SUNUCU-otoriterdir. StoreUser → SAHTE PlatformUser token / identity-bridge ÜRETİLMEZ.
 *
 * Faz E1'in soft-reconcile geçici çözümü (rotation yerine `/auth/store/session` yeniden-okuması)
 * KALDIRILDI. Extend başarısız olursa (401/oturum geçersiz) `errorResponse` hata gövdesini
 * yansıtır; SessionGuard bunu extend-hatası olarak gösterir ve me() teyidi/logout akışına düşer.
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
    const result = await createApiClient().storeAuth.extend(token);
    const response = NextResponse.json({ timing: result.timing });
    setSessionCookie(response, result.token, result.expiresAt, result.timing.rememberMe);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
