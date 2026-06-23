import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { setSessionCookie } from "../../../../lib/server/session";
import { badRequestResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Platform admin login proxy. Gateway login'i cagirir; basarida bearer token'i
 * httpOnly cookie'ye yazar ve istemciye SADECE kullanici bilgisini doner (token
 * yanit govdesine veya log'a yazilmaz; parola loglanmaz).
 */
export async function POST(request: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequestResponse();
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";

  try {
    const result = await createApiClient().auth.platformLogin({ email, password });
    const response = NextResponse.json({ user: result.user });
    setSessionCookie(response, result.token, result.expiresAt);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
