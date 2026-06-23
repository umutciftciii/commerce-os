import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import type { AdminStoreCreateRequest } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse, unauthorizedResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Mağaza listesini gateway'den proxy'ler (session cookie gerektirir). */
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) {
    return unauthorizedResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.stores.list(token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni mağaza oluşturur. Govde dogrulamasi gateway Zod kontratina birakilir. */
export async function POST(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) {
    return unauthorizedResponse();
  }
  if (!isValidCsrfRequest(request)) {
    return csrfForbiddenResponse();
  }
  let body: AdminStoreCreateRequest;
  try {
    body = (await request.json()) as AdminStoreCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const store = await createApiClient().admin.stores.create(body, token);
    return NextResponse.json(store, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
