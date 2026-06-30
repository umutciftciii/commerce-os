import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShipmentManualTrackingRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * F3C.5 (TODO-121) — Generic "Manuel Takip No Gir". Sağlayıcıya ÇAĞRI YAPMAZ; admin
 * takip numarasını elle girer (provider entegrasyonu olmayan/dışı kargo akışları için).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShipmentManualTrackingRequest;
  try {
    body = (await request.json()) as ShipmentManualTrackingRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.shipments.manualTracking(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
