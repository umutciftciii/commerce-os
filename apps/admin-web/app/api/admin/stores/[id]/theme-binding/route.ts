import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import type { ThemeBindingAssignRequest } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
  unauthorizedResponse,
} from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-164 (ADR-222) — Platform Admin "Tema ve Marka". Store-scoped theme-binding
 * özeti (GET) + theme-key atama (PUT). Auth gateway'de platform-admin; burada
 * yalnız oturum + CSRF köprülenir.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return unauthorizedResponse();
  const { id } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.stores.themeBinding.get(id, token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return unauthorizedResponse();
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const { id } = await params;
  let body: ThemeBindingAssignRequest;
  try {
    body = (await request.json()) as ThemeBindingAssignRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.stores.themeBinding.assign(id, body, token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
