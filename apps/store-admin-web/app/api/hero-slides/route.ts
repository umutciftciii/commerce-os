import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type HeroSlideCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * ADR-065 Faz 2 (Dilim 5) — Ana sayfa hero slide'larini gateway'den proxy'ler.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.heroSlides.list(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni hero slide olusturur. Govde dogrulamasi gateway Zod kontratina birakilir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: HeroSlideCreateRequest;
  try {
    body = (await request.json()) as HeroSlideCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const slide = await createApiClient().admin.heroSlides.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(slide, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
