import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { errorResponse } from "../../../lib/server/respond";
import { REVIEW_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-159E (ADR-094) — Ürün yorumu moderasyon dizinini gateway'den proxy'ler.
 * Store bağlamı server-side; Data Grid query'si allowlist ile taşınır.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, REVIEW_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.reviews.list(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
