import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type OrderCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Secili mağazanin siparislerini gateway'den proxy'ler. Store bağlami server-side. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.orders.list(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni taslak sipariş olusturur (kalemlerle birlikte). */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: OrderCreateRequest;
  try {
    body = (await request.json()) as OrderCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const order = await createApiClient().admin.orders.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(order, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
