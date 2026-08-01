import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type BrandCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";
import { BRAND_LIST_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-165A (ADR-165A) Task 15/16 — Marka (Brand) listesi/oluşturma proxy'si. Kategori
 * deseniyle aynı; CATALOG çekirdek/always-on modül olduğundan capability her zaman geçer
 * (nihai enforcement gateway'de). Govde dogrulamasi gateway Zod kontratina birakilir.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, BRAND_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.brands.list(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni marka olusturur. Govde dogrulamasi gateway Zod kontratina birakilir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: BrandCreateRequest;
  try {
    body = (await request.json()) as BrandCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const brand = await createApiClient().admin.brands.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(brand, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
