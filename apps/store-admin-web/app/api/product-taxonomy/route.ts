import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductTaxonomyCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";
import { PRODUCT_TAXONOMY_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-165A (ADR-165A) Task 24 — governed Product Taxonomy (Ürün Sözlükleri) liste proxy'si.
 * `?type=` sekme secimini tasir (allowlist — gercek dogrulama gateway'de).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, PRODUCT_TAXONOMY_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.productTaxonomy.list(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni governed taksonomi degeri olusturur (quick-create). Govde dogrulamasi gateway Zod kontratina birakilir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: ProductTaxonomyCreateRequest;
  try {
    body = (await request.json()) as ProductTaxonomyCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.productTaxonomy.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
