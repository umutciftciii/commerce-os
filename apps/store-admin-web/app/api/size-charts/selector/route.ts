import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";
import { SIZE_CHART_SELECTOR_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-165A Tasks 25/26 — Beden tablosu seçici ucu (proxy). Ürün/kategori/marka
 * seçicileriyle AYNI sözleşme (ADR-090): salt-okuma, `?ids=` verilirse ÇÖZÜM modu —
 * doğrulama ve üst sınırlar gateway'dedir. STATİK yol; `/size-charts/[id]`
 * route'undan ÖNCE Next.js tarafından eşleşir (dizin ayrımı yeterli).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, SIZE_CHART_SELECTOR_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.sizeCharts.selector(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
