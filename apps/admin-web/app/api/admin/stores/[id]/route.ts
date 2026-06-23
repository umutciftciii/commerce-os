import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import type { AdminStoreUpdateRequest } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse, unauthorizedResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Mağazayı günceller (ad/durum). slug değiştirilemez. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) {
    return unauthorizedResponse();
  }
  if (!isValidCsrfRequest(request)) {
    return csrfForbiddenResponse();
  }
  const { id } = await params;
  let body: AdminStoreUpdateRequest;
  try {
    body = (await request.json()) as AdminStoreUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.stores.update(id, body, token));
  } catch (error) {
    return errorResponse(error);
  }
}
