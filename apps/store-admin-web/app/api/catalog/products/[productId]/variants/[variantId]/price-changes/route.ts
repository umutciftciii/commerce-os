import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** F4B — Varyant fiyat/liste/maliyet degisikligi gecmisini listeler (yonetim). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string; variantId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId, variantId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.products.variants.priceChanges(
        ctx.store.id,
        productId,
        variantId,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
