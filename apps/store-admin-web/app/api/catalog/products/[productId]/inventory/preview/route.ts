import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type InventoryPreviewRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { badRequestResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// TODO-152 (ADR-076) — Inventory Engine önizleme. Mutasyon DEĞİL → CSRF gerekmez.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  let body: InventoryPreviewRequest;
  try {
    body = (await request.json()) as InventoryPreviewRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.inventory.preview(ctx.store.id, productId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
