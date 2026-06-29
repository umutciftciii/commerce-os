import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingRatePlanCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** F3C.2 — Mağazanın kargo TARİFE planlarını gateway'den proxy'ler (secret içermez). */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.shippingRatePlans.list(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni kargo tarife planı oluşturur. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: ShippingRatePlanCreateRequest;
  try {
    body = (await request.json()) as ShippingRatePlanCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.shippingRatePlans.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
