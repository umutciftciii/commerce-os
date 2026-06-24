import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { clearSessionCookie, getSessionToken } from "../../../../lib/server/session";
import { csrfForbiddenResponse } from "../../../../lib/server/respond";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";

export const dynamic = "force-dynamic";

/** Oturumu kapatir. CSRF korumali; cookie her durumda temizlenir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) {
    return csrfForbiddenResponse();
  }
  const token = getSessionToken(request);
  if (token) {
    await createApiClient().auth.platformLogout(token).catch(() => {
      // Gateway revoke basarisiz olsa bile yerel cookie temizlenir.
    });
  }
  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  return response;
}
