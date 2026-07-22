import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";
import { PRODUCT_LIST_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * Secili mağazanin urunlerini gateway'den proxy'ler.
 * TODO-159A (ADR-089) — arama/filtre/sıralama/sayfalama query'si allowlist ile taşınır.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, PRODUCT_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.products.list(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni urun olusturur. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: ProductCreateRequest;
  try {
    body = (await request.json()) as ProductCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const product = await createApiClient().admin.products.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
