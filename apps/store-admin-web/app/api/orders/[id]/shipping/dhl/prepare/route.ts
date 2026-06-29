import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingPrepareRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * F3C.3 — "Kargo Hazırlığı Başlat": DHL createRecipient + createOrder. Sipariş SONRASI
 * admin aksiyonu (checkout DHL operasyon çağrısı yapmaz). Varsayılan guard altında.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShippingPrepareRequest;
  try {
    body = (await request.json()) as ShippingPrepareRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.orderShipping.dhlPrepare(ctx.store.id, id, body, ctx.token),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
