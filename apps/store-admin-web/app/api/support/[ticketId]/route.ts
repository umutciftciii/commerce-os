import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-177 — Ürün Desteği talep detayı (storeId-scoped; başka store/yok → gateway 404). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { ticketId } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.productSupport.detail(ctx.store.id, ticketId, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
