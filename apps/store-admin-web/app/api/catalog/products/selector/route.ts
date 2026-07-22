import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";
import { PRODUCT_SELECTOR_KEYS, pickListQuery } from "../../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-159B (ADR-090) — Ürün seçici ucu (proxy).
 *
 * Salt-okuma; diğer GET route'ları gibi CSRF gerektirmez. Query allowlist ile
 * taşınır (`?ids=` çözüm modu dahil); doğrulama ve üst sınırlar gateway'dedir.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, PRODUCT_SELECTOR_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.products.selector(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
