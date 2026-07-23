import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-159E (ADR-094) — Yorum moderasyon detayını (tam gövde + not + sipariş ref) proxy'ler. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.reviews.get(ctx.store.id, id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
