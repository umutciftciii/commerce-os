import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductCategoryCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";
import { CATEGORY_LIST_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * Secili mağazanin kategorilerini gateway'den proxy'ler.
 * TODO-159A (ADR-089) — Data Grid query'si allowlist ile taşınır.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, CATEGORY_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.categories.list(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni kategori olusturur. Govde dogrulamasi gateway Zod kontratina birakilir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: ProductCategoryCreateRequest;
  try {
    body = (await request.json()) as ProductCategoryCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const category = await createApiClient().admin.categories.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
