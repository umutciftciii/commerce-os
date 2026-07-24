import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";
import { SPONSORED_ANALYTICS_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-161 — Sponsorlu performans CSV dışa aktarımı. Gateway CSV metnini döndürür;
 * BFF onu attachment olarak istemciye geçirir (JSON değil, text/csv). Aynı filtreler, tenant-safe.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, SPONSORED_ANALYTICS_KEYS);
  try {
    const csv = await createApiClient().admin.sponsoredProducts.exportAnalytics(ctx.store.id, ctx.token, query);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="sponsored-performance.csv"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
