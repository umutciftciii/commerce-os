import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";
import { INVENTORY_MATRIX_LIST_KEYS, pickListQuery } from "../../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

// TODO-152A — Mağaza-geneli SALT-OKUMA stok matris (izleme/operasyon merkezi). Seçili depo current
// bakiye + SAF göstergeler. Düzenleme YOK → CSRF gerekmez (salt-okuma).
// TODO-159C (ADR-092) — arama/filtre/sıralama/sayfalama query'si allowlist ile taşınır (nihai
// doğrulama gateway'de). ?warehouseId= verilmezse gateway store default depoyu çözer.
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, INVENTORY_MATRIX_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.inventory.storeMatrix(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
