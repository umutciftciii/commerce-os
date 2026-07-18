import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext, type StoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

export interface DashboardSummary {
  store: StoreContext;
  products: { total: number; active: number };
  categories: { total: number };
  inventory: { records: number; lowStock: number; totalOnHand: number };
}

/**
 * Canli katalog/stok ozetini server-side hesaplar. Toplamlar gateway
 * pagination'indan kesin alinir; aktif urun ve kritik stok sayilari ilk sayfa
 * (gateway varsayilan limit) uzerinden hesaplanir — demo veri seti icin yeterli,
 * pagination-aware aggregation tech debt olarak isaretlidir (docs/TECHNICAL_DEBT.md).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;

  const api = createApiClient();
  try {
    // TODO-152A — Stok özeti artık Inventory Engine'in mağaza-geneli matrisinden türetilir.
    // "Kritik stok" sayısı legacy lowStockThreshold yerine motorun LOW_STOCK durumundan (tek
    // authority InventoryBalance.reorderPoint) gelir. Depo verilmez → gateway default depoyu çözer.
    const [products, categories, matrix] = await Promise.all([
      api.admin.products.list(ctx.store.id, ctx.token),
      api.admin.categories.list(ctx.store.id, ctx.token),
      api.admin.inventory.storeMatrix(ctx.store.id, undefined, ctx.token),
    ]);

    const activeProducts = products.data.filter((product) => product.status === "ACTIVE").length;
    const lowStock = matrix.rows.filter((row) => row.currentCalc.status === "LOW_STOCK").length;
    const totalOnHand = matrix.rows.reduce((sum, row) => sum + row.current.onHand, 0);

    const summary: DashboardSummary = {
      store: ctx.store,
      products: { total: products.pagination.total, active: activeProducts },
      categories: { total: categories.pagination.total },
      inventory: { records: matrix.rows.length, lowStock, totalOnHand },
    };
    return NextResponse.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}
