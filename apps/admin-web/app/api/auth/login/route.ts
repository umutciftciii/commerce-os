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
  let body: { email?: unknown; password?: unknown; rememberMe?: unknown };
  try {
    body = await request.json();
  } catch {
    return badRequestResponse();
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  // ADR-271 — "Beni hatirla" (server-otoriter oturum penceresi). Varsayilan KAPALI.
  const rememberMe = body.rememberMe === true;

  try {
    const result = await createApiClient().auth.platformLogin({ email, password, rememberMe });
    const response = NextResponse.json({ user: result.user });
    // Cookie kaliciligi rememberMe'ye gore; expires gateway'in absolute deadline'i.
    setSessionCookie(response, result.token, result.expiresAt, rememberMe);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
