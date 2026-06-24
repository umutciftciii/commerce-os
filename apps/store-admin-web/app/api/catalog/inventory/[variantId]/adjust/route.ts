import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type InventoryAdjustRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Bir varyantin stogunu duzeltir (pozitif/negatif delta). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ variantId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { variantId } = await params;
  let body: InventoryAdjustRequest;
  try {
    body = (await request.json()) as InventoryAdjustRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.inventory.adjust(ctx.store.id, variantId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
