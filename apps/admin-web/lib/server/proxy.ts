import { NextResponse, type NextRequest } from "next/server";
import { getSessionToken } from "./session";
import { isValidCsrfRequest } from "./csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
  unauthorizedResponse,
} from "./respond";

/**
 * TODO-164B Dilim 2 — Platform Admin BFF ince proxy yardımcıları. Tarayıcı yalnız
 * same-origin `/api/*`'e konuşur; token (httpOnly cookie) + CSRF köprülenir, gateway'e
 * iletilir. Böylece her theme-library route dosyası 2-3 satır kalır ve auth/CSRF/hata
 * eşlemesi TEK yerde tutulur.
 */
export async function proxyGet<T>(
  request: NextRequest,
  fn: (token: string) => Promise<T>,
): Promise<NextResponse> {
  const token = getSessionToken(request);
  if (!token) return unauthorizedResponse();
  try {
    return NextResponse.json(await fn(token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function proxyMutation<T>(
  request: NextRequest,
  fn: (token: string, body: unknown) => Promise<T>,
  opts?: { noBody?: boolean },
): Promise<NextResponse> {
  const token = getSessionToken(request);
  if (!token) return unauthorizedResponse();
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  let body: unknown = {};
  if (!opts?.noBody) {
    try {
      body = await request.json();
    } catch {
      return badRequestResponse();
    }
  }
  try {
    return NextResponse.json(await fn(token, body));
  } catch (error) {
    return errorResponse(error);
  }
}
