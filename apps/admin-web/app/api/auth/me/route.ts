import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { getSessionToken, clearSessionCookie } from "../../../../lib/server/session";
import { errorResponse, unauthorizedResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Aktif oturumu dogrular. Cookie yoksa 401; gateway 401 donerse cookie temizlenir. */
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) {
    return unauthorizedResponse();
  }
  try {
    const me = await createApiClient().auth.platformMe(token);
    return NextResponse.json(me);
  } catch (error) {
    const response = errorResponse(error);
    if (response.status === 401) {
      clearSessionCookie(response);
    }
    return response;
  }
}
