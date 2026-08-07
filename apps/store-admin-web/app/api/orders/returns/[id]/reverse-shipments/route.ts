import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminReverseShipmentCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// TODO-173 (ADR-274) — reddedilen ürünü müşteriye geri gönder (STORE_RETURN_TO_CUSTOMER). Para iadesi DEĞİL.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: AdminReverseShipmentCreateRequest;
  try {
    body = (await request.json()) as AdminReverseShipmentCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.createReverseShipment(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
