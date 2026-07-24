import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-160A (ADR-109…113) — Store-scoped SKU audit proxy'si (salt-okuma governance raporu; limitli).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const limitRaw = request.nextUrl.searchParams.get("limit");
  const limit = limitRaw !== null && Number.isFinite(Number(limitRaw)) ? Number(limitRaw) : undefined;
  try {
    return NextResponse.json(
      await createApiClient().admin.products.sku.audit(ctx.store.id, limit, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
