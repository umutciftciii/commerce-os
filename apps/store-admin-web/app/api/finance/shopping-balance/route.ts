import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";
import { SHOPPING_BALANCE_LIST_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * Shopping Balance Admin (Müşteri Bakiye Yönetimi) — merkezî per-müşteri bakiye listesi + KPI özeti.
 * Store bağlamı server-side (requireStoreContext); query allowlist ile gateway'e taşınır. SALT-OKUNUR.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, SHOPPING_BALANCE_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.shoppingBalance.list(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
