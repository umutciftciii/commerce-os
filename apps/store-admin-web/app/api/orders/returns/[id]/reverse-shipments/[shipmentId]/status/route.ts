import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminReverseShipmentStatusRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
} from "../../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// TODO-173 (ADR-274) — reverse shipment durum aksiyonu (kargoya verildi/teslim/iptal).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; shipmentId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, shipmentId } = await params;
  let body: AdminReverseShipmentStatusRequest;
  try {
    body = (await request.json()) as AdminReverseShipmentStatusRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.reverseShipmentStatus(ctx.store.id, id, shipmentId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
