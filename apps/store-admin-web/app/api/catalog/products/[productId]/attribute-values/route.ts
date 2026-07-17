import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Faz 2B (TODO-146) — Bir ürünün mevcut attribute DEĞERLERİNİ proxy'ler (düzenleme
 * ekranı round-trip'i). Yazma gömülü `attributeValues` (product PATCH) üzerinden
 * gider; bu uç yalnız okumadır. Store bağlamı sunucu-tarafında çözülür.
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
      await createApiClient().admin.products.attributeValues.get(ctx.store.id, productId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
