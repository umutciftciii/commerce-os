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
    const [products, categories, inventory] = await Promise.all([
      api.admin.products.list(ctx.store.id, ctx.token),
      api.admin.categories.list(ctx.store.id, ctx.token),
      api.admin.inventory.list(ctx.store.id, ctx.token),
    ]);

    const activeProducts = products.data.filter((product) => product.status === "ACTIVE").length;
    const lowStock = inventory.data.filter(
      (item) =>
        item.lowStockThreshold !== null && item.quantityAvailable <= item.lowStockThreshold,
    ).length;
    const totalOnHand = inventory.data.reduce((sum, item) => sum + item.quantityOnHand, 0);

    const summary: DashboardSummary = {
      store: ctx.store,
      products: { total: products.pagination.total, active: activeProducts },
      categories: { total: categories.pagination.total },
      inventory: { records: inventory.pagination.total, lowStock, totalOnHand },
    };
    return NextResponse.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}
