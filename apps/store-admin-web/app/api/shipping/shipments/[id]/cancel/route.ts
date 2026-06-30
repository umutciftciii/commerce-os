import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShipmentCancelRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * F3C.5 (TODO-121) — Generic "Gönderi Kaydını İptal Et". Explicit onay zorunlu; gateway
 * sağlayıcıya iptal dispatch eder (fiziksel teslim yapılmışsa başarısız olabilir).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShipmentCancelRequest;
  try {
    body = (await request.json()) as ShipmentCancelRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.shipments.cancel(ctx.store.id, id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
