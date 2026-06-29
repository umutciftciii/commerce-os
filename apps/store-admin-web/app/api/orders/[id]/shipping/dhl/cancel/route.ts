import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingCancelRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * F3C.3 — "Kargo Kaydını İptal Et": DHL cancel. Endpoint MNG tarafında HENÜZ TEYİT
 * EDİLMEDİ → gateway ENDPOINT_UNRESOLVED (409) döner. UI'da aksiyon disabled.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShippingCancelRequest;
  try {
    body = (await request.json()) as ShippingCancelRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.orderShipping.dhlCancel(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
