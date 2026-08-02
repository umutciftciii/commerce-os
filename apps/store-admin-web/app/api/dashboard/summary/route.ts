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
 * pagination'indan kesin alinir.
 *
 * TODO-159C (ADR-092) — Stok toplamlari artik matrisin SAYFADAN BAGIMSIZ `summary`
 * alanindan gelir (tum magaza, ilk sayfa DEGIL). Onceki "ilk sayfa uzerinden
 * hesaplama" tech-debt'i bu ucta kapandi: pageSize=1 istenir (satirlara ihtiyac
 * yok), summary yine tum eslesmelerin aggregate'idir.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;

  const api = createApiClient();
  try {
    // TODO-152A/159C — Stok özeti Inventory Engine'in mağaza-geneli matris `summary`'sinden türetilir.
    // "Kritik stok" sayısı legacy lowStockThreshold yerine motorun LOW_STOCK durumundan (tek authority
    // InventoryBalance.reorderPoint) gelir. Depo verilmez → gateway default depoyu çözer. pageSize=1:
    // yalnız summary lazım, satır taşınmaz.
    // "Aktif ürün" sayısı tüm katalogtan gelmeli. Önceden ilk sayfa satırları
    // filtrelenerek hesaplanıyordu → mağaza tek sayfadan büyükse ciddi undercount
    // (ör. 418 aktif ürün "24" görünüyordu). Toplamlar gibi bu sayı da gateway
    // pagination `total`'ından kesin alınır: status=ACTIVE ile ayrı bir hafif
    // sayım (pageSize=1, satır taşımaz) yapılır.
    const [products, activeProductCount, categories, matrix] = await Promise.all([
      api.admin.products.list(ctx.store.id, ctx.token, { pageSize: 1 }),
      api.admin.products.list(ctx.store.id, ctx.token, { pageSize: 1, status: "ACTIVE" }),
      api.admin.categories.list(ctx.store.id, ctx.token),
      api.admin.inventory.storeMatrix(ctx.store.id, ctx.token, { pageSize: 1 }),
    ]);

    const summary: DashboardSummary = {
      store: ctx.store,
      products: {
        total: products.pagination.total,
        active: activeProductCount.pagination.total,
      },
      categories: { total: categories.pagination.total },
      inventory: {
        records: matrix.summary.totalVariants,
        lowStock: matrix.summary.lowStock,
        totalOnHand: matrix.summary.totalOnHand,
      },
    };
    return NextResponse.json(summary);
  } catch (error) {
    return errorResponse(error);
  }
}
