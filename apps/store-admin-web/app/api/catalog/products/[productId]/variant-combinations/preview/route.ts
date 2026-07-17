import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Faz 2C-2 (ADR-071) — Bir ürünün kalıcı varyant EKSEN reçetesinden ÜRETİLECEK kombinasyonların
 * ÖNİZLEMESİNİ proxy'ler (düzenleme ekranı). YALNIZ OKUMA: ProductVariant / combinationKey / SKU
 * OLUŞTURULMAZ. Store bağlamı sunucu-tarafında çözülür. Guard aşımı (PREVIEW_LIMIT_EXCEEDED) 422 döner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.products.variantCombinations.preview(
        ctx.store.id,
        productId,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
