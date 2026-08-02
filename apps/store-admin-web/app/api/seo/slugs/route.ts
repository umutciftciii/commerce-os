import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";
import { SLUG_LIST_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-166 (ADR-265) — Ürün/kategori/marka güncel slug + geçmiş projeksiyonunu proxy'ler.
 * Store bağlamı server-side; Data Grid query'si allowlist ile taşınır.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, SLUG_LIST_KEYS);
  try {
    return NextResponse.json(await createApiClient().admin.slugs.list(ctx.store.id, ctx.token, query));
  } catch (error) {
    return errorResponse(error);
  }
}
