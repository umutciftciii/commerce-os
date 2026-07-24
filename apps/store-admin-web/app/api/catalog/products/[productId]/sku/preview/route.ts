import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SkuRegenerateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { badRequestResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-160A (ADR-109…113) — SKU preview proxy'si (deterministik öneri + collision). YALNIZ OKUMA:
 * hiçbir varyant yazılmaz. Store bağlamı sunucu-tarafında çözülür.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  let body: SkuRegenerateRequest;
  try {
    body = (await request.json()) as SkuRegenerateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.sku.preview(ctx.store.id, productId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
