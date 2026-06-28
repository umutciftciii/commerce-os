import { NextResponse, type NextRequest } from "next/server";
import {
  createApiClient,
  type OrderCreateRequest,
  type OrderListQuery,
} from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-073 — İstemci query string'inden yalnız bilinen filtre anahtarlarını seçip
 * gateway'e taşır. Nihai doğrulama (enum/tarih/limit) gateway'de contract şemasıyla
 * yapılır; geçersiz değer gateway 400'ü olarak yansır. Store-admin web katmanı
 * contracts'a doğrudan bağlanmaz (sınır api-client üzerinden korunur).
 */
function readOrderFilters(params: URLSearchParams): OrderListQuery {
  const query: OrderListQuery = {};
  const status = params.get("status");
  if (status) query.status = status as OrderListQuery["status"];
  const paymentStatus = params.get("paymentStatus");
  if (paymentStatus) query.paymentStatus = paymentStatus as OrderListQuery["paymentStatus"];
  const fulfillmentStatus = params.get("fulfillmentStatus");
  if (fulfillmentStatus) {
    query.fulfillmentStatus = fulfillmentStatus as OrderListQuery["fulfillmentStatus"];
  }
  const search = params.get("search")?.trim();
  if (search) query.search = search;
  const dateFrom = params.get("dateFrom");
  if (dateFrom) query.dateFrom = dateFrom;
  const dateTo = params.get("dateTo");
  if (dateTo) query.dateTo = dateTo;
  const limit = params.get("limit");
  if (limit) query.limit = Number(limit);
  const offset = params.get("offset");
  if (offset) query.offset = Number(offset);
  return query;
}

/** Secili mağazanin siparislerini gateway'den proxy'ler. Store bağlami server-side. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = readOrderFilters(request.nextUrl.searchParams);
  try {
    return NextResponse.json(
      await createApiClient().admin.orders.list(ctx.store.id, query, ctx.token),
    );
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
