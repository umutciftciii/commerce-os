import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-169 (blocker #6) — Sipariş detayına iade entegrasyonu proxy'si. Bir siparişin ORTAK iade
 * özeti (projection) + o siparişe ait iade taleplerini döner. Store bağlamı server-side çözülür;
 * nihai yetki/scoping gateway'de (requireStorePlatformAdmin + storeId-first).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.orderReturns(ctx.store.id, id, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
