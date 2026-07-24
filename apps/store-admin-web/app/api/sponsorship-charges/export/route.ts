import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";
import { SPONSORSHIP_CHARGE_LIST_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/** TODO-161A — Tahakkuk CSV dışa aktarım (tenant-safe, CSV-injection guard gateway'de). */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, SPONSORSHIP_CHARGE_LIST_KEYS);
  try {
    const csv = await createApiClient().admin.sponsorship.exportCharges(ctx.store.id, ctx.token, query);
    return new NextResponse(csv, {
      status: 200,
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="sponsorship-charges.csv"' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
