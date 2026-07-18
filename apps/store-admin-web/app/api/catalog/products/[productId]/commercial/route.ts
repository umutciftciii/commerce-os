import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-151 (ADR-074) — Commercial Engine MATRIS okuma proxy'si (Price/Compare-at/Cost/VAT).
 * YALNIZ OKUMA: varyantların güncel ticari değerlerini + hesaplanan marj/markup/discount'ı döner.
 * Store bağlamı sunucu-tarafında çözülür.
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
      await createApiClient().admin.products.commercial.get(ctx.store.id, productId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
