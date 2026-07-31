import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SizeChartAssignRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-165 (ADR-249) — Beden tablosunu bir kapsama (STORE / CATEGORY / PRODUCT) bağlar. Govde
 * dogrulamasi (scope + categoryId/productId zorunluluğu) gateway Zod kontratına bırakılır.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: SizeChartAssignRequest;
  try {
    body = (await request.json()) as SizeChartAssignRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.sizeCharts.assign(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
