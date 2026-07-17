import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Faz 2C-3 (ADR-072) — Bir ürünün kalıcı varyant EKSEN reçetesinden ProductVariant kayıtlarını ÜRETİR
 * (persistence). Reçeteden hedef kombinasyonlar üretilir ve mevcut varyantlarla diff'lenerek
 * create/keep/restore/archive uygulanır (sunucu-otoriter, tek transaction). Store bağlamı sunucu-tarafında
 * çözülür; gövde yoktur (authoritative kaynak DB reçetesidir). Preview ucu (GET) BOZULMAZ.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.products.variantCombinations.generate(
        ctx.store.id,
        productId,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
