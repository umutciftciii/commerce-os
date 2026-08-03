import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";
import { FINANCE_REPORT_KEYS, pickListQuery } from "../../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/** ADR-268 — Sipariş finansal satırları CSV (aktif filtreler; limit/streaming gateway'de). */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, FINANCE_REPORT_KEYS);
  try {
    const csv = await createApiClient().admin.finance.exportOrders(ctx.store.id, ctx.token, query);
    return new NextResponse(csv, {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="finance-order-lines.csv"',
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
