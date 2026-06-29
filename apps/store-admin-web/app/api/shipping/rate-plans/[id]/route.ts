import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingRatePlanUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.shippingRatePlans.get(ctx.store.id, id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Tarife planını günceller (mod/tutar/eşik/durum/varsayılan). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShippingRatePlanUpdateRequest;
  try {
    body = (await request.json()) as ShippingRatePlanUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingRatePlans.update(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Tarife planını siler. */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    await createApiClient().admin.shippingRatePlans.remove(ctx.store.id, id, ctx.token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
