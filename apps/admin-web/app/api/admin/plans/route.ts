import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import type { PlanCreateRequest } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse, unauthorizedResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Paket listesini gateway'den proxy'ler (session cookie gerektirir). */
export async function GET(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) {
    return unauthorizedResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.plans.list(token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni paket oluşturur. Govde dogrulamasi gateway Zod kontratina birakilir. */
export async function POST(request: NextRequest) {
  const token = getSessionToken(request);
  if (!token) {
    return unauthorizedResponse();
  }
  if (!isValidCsrfRequest(request)) {
    return csrfForbiddenResponse();
  }
  let body: PlanCreateRequest;
  try {
    body = (await request.json()) as PlanCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const plan = await createApiClient().admin.plans.create(body, token);
    return NextResponse.json(plan, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
