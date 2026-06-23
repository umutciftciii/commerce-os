import { NextResponse } from "next/server";
import { CSRF_HEADER_NAME, generateCsrfToken, setCsrfCookie } from "../../../../lib/server/csrf";

export const dynamic = "force-dynamic";

/** Mutating BFF istekleri icin double-submit CSRF token'i uretir. */
export function GET() {
  const csrfToken = generateCsrfToken();
  const response = NextResponse.json({ csrfToken, headerName: CSRF_HEADER_NAME });
  setCsrfCookie(response, csrfToken);
  return response;
}
