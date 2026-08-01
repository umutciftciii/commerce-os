import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../lib/server/respond";
import { BRAND_PRODUCTS_LIST_KEYS, pickListQuery } from "../../../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-165A (ADR-165A) Task 15/16 gap — Marka "Bağlı ürünler" listesi proxy'si. Task 6'nin
 * COUNT-ONLY govdesinden GERCEK (sayfalanmis/aranabilir) listeye yukseltildi.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { brandId } = await params;
  const query = pickListQuery(request.nextUrl.searchParams, BRAND_PRODUCTS_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.brands.products(ctx.store.id, brandId, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
