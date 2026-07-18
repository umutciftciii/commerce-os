import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// TODO-152A — Mağaza-geneli SALT-OKUMA stok matris (izleme/operasyon merkezi). Tüm ürünler + seçili
// depo current bakiye + SAF göstergeler. Düzenleme YOK → CSRF gerekmez (salt-okuma). ?warehouseId=
// verilmezse gateway store default depoyu çözer.
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const warehouseId = request.nextUrl.searchParams.get("warehouseId") ?? undefined;
  try {
    return NextResponse.json(
      await createApiClient().admin.inventory.storeMatrix(ctx.store.id, warehouseId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
