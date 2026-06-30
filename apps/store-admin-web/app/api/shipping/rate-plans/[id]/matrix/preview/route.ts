import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingMatrixApplyRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** F3C.4 — Tarife matrisi önizleme: grid'i diff'ler, DB'ye yazmaz. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShippingMatrixApplyRequest;
  try {
    body = (await request.json()) as ShippingMatrixApplyRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const result = await createApiClient().admin.shippingRatePlans.matrixPreview(ctx.store.id, id, body, ctx.token);
    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
