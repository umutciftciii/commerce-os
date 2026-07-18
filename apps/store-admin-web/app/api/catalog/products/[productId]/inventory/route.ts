import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// TODO-152 (ADR-076) — Inventory Engine matris okuma (current). Salt-okuma → CSRF gerekmez.
// warehouseId query opsiyonel; verilmezse sunucu default depoyu çözer.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  const warehouseId = request.nextUrl.searchParams.get("warehouseId") ?? undefined;
  try {
    return NextResponse.json(
      await createApiClient().admin.products.inventory.get(ctx.store.id, productId, warehouseId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
