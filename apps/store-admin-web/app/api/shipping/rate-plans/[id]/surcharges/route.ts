import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingSurchargeInput } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Tarifeye ek hizmet bedeli ekler — SMS/güvence/mobil alan/hamaliye/ağır gönderi. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShippingSurchargeInput;
  try {
    body = (await request.json()) as ShippingSurchargeInput;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.shippingRatePlans.addSurcharge(ctx.store.id, id, body, ctx.token);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
