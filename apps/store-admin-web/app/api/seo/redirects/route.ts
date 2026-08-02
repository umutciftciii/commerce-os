import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminRedirectCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";
import { REDIRECT_LIST_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-166 (ADR-265) — Seçili mağazanın yönlendirme kurallarını gateway'den proxy'ler. Store
 * bağlamı server-side; Data Grid query'si allowlist ile taşınır.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, REDIRECT_LIST_KEYS);
  try {
    return NextResponse.json(await createApiClient().admin.redirects.list(ctx.store.id, ctx.token, query));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni MANUEL yönlendirme kuralı oluşturur (CSRF zorunlu; güvenlik doğrulaması gateway'de). */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: AdminRedirectCreateRequest;
  try {
    body = (await request.json()) as AdminRedirectCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const result = await createApiClient().admin.redirects.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
