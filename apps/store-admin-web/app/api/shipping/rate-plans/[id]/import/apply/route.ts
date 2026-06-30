import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingImportRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** F3C.4 — CSV import uygula: server-side re-parse + transaction (yalniz upsert). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShippingImportRequest;
  try {
    body = (await request.json()) as ShippingImportRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const result = await createApiClient().admin.shippingRatePlans.importApply(ctx.store.id, id, body, ctx.token);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
