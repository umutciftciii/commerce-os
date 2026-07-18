import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type IdentityApplyRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-150 (ADR-073) — Identity Management Engine PREVIEW proxy'si (SKU/Barcode/Title pattern motoru).
 * YALNIZ OKUMA + deterministik: hiçbir varyant yazılmaz. Pattern'lar query string'ten okunur ve
 * gateway'e taşınır. Store bağlamı sunucu-tarafında çözülür; pattern hatası / collision blokajı 422 döner.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  const sp = request.nextUrl.searchParams;
  const query: IdentityApplyRequest = {};
  if (sp.has("sku")) query.sku = sp.get("sku") ?? undefined;
  if (sp.has("barcode")) query.barcode = sp.get("barcode") ?? undefined;
  if (sp.has("title")) query.title = sp.get("title") ?? undefined;
  if (sp.has("seqStart")) {
    const n = Number(sp.get("seqStart"));
    if (Number.isFinite(n)) query.seqStart = n;
  }
  if (sp.has("regenerateCustomTitles")) {
    query.regenerateCustomTitles = sp.get("regenerateCustomTitles") === "true";
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.identity.preview(ctx.store.id, productId, query, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
