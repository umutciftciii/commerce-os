import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { getSessionToken, setSessionCookie } from "../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * ADR-271 — Oturum uzatma (extend). CSRF korumali (double-submit). Gateway token'i
 * ROTATE eder (absolute tavan DEGISMEZ); yeni token httpOnly cookie'ye yeniden yazilir.
 * Cookie kaliciligi yeni oturumun rememberMe'sine gore (gateway timing'inden turer).
 * Istemciye SADECE zamanlama (idle/absolute/lead) doner; raw token govdeye yazilmaz.
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
    const result = await createApiClient().auth.platformExtend(token);
    const response = NextResponse.json({ timing: result.timing });
    setSessionCookie(response, result.token, result.expiresAt, result.timing.rememberMe);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
