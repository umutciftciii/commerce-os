import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";
import { BRAND_SELECTOR_KEYS, pickListQuery } from "../../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-165A (ADR-165A) Task 17 — Marka seçici ucu (proxy). Ürün/kategori seçicileriyle
 * AYNI sözleşme (ADR-090): salt-okuma, `?ids=` verilirse ÇÖZÜM modu — doğrulama ve üst
 * sınırlar gateway'dedir.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, BRAND_SELECTOR_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.brands.selector(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
