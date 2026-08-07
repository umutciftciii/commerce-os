import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-174B (ADR-283) — Sipariş Deneyimi KPI özeti (mağaza-geneli; ayrı endpoint). */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query: Record<string, string> = {};
  for (const k of ["dateFrom", "dateTo"]) {
    const v = request.nextUrl.searchParams.get(k);
    if (v != null && v !== "") query[k] = v;
  }
  try {
    return NextResponse.json(await createApiClient().admin.orderExperience.kpi(ctx.store.id, ctx.token, query));
  } catch (error) {
    return errorResponse(error);
  }
}
