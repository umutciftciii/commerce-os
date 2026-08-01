import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-165A Tasks 25/26 — Ürünün GÜNCEL beden tablosu bağlantısı proxy'si. Ürün formunun
 * Beden Tablosu adımı bunu okuyup "bağlı: X (ürün)" / "kategori/mağaza varsayılanı: Y"
 * kartını kurar. `categoryId` opsiyoneldir (form zaten `primaryCategoryId`'yi RHF
 * state'inde taşır; ayrı bir ürün/kategori çözümü YAPILMAZ).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  const categoryId = request.nextUrl.searchParams.get("categoryId") ?? undefined;
  try {
    return NextResponse.json(
      await createApiClient().admin.sizeCharts.getProductAssignment(
        ctx.store.id,
        productId,
        categoryId,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
