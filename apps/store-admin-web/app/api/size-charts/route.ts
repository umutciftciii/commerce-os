import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SizeChartCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-165 (ADR-249) — Beden tablosu (SizeChart) listesi/oluşturma proxy'si. Modül effective
 * durumu + capability enforcement gateway'de (FASHION_VERTICAL); rota `layout.tsx` ModuleGuard'ı
 * ile de sunucu-tarafı korunur. Govde dogrulamasi gateway Zod kontratina birakilir.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.sizeCharts.list(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: SizeChartCreateRequest;
  try {
    body = (await request.json()) as SizeChartCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const chart = await createApiClient().admin.sizeCharts.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(chart, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
