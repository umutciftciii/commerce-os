import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type BrandUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-165A (ADR-165A) Task 15/16 — Tekil markayı getirir. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { brandId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.brands.get(ctx.store.id, brandId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Markayı gunceller (409 BRAND_SLUG_TAKEN, 403 BRAND_MEDIA_CROSS_STORE gateway'den taşınır). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { brandId } = await params;
  let body: BrandUpdateRequest;
  try {
    body = (await request.json()) as BrandUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.brands.update(ctx.store.id, brandId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
