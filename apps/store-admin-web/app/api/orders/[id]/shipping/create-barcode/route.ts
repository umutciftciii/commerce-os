import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingCreateBarcodeRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Canlı barkod/gönderi oluşturma. Varsayılan guard altında (gateway 409 BARCODE_CREATE_DISABLED). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShippingCreateBarcodeRequest;
  try {
    body = (await request.json()) as ShippingCreateBarcodeRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.orderShipping.createBarcode(ctx.store.id, id, body, ctx.token),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
