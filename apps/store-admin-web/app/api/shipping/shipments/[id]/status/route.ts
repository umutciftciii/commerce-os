import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShipmentStatusUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-162 (ADR-101) — Operatör manuel kargo durumu ilerletme. Sağlayıcıya ÇAĞRI YAPMAZ;
 * entegre süreç dışı kargolar için teslim akışını elle tamamlar (DELIVERED → sipariş FULFILLED).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShipmentStatusUpdateRequest;
  try {
    body = (await request.json()) as ShipmentStatusUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.shipments.manualStatus(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
