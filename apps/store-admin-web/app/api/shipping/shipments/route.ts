import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShipmentListQuery } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * F3C.5 (TODO-121) — İstemci query string'inden yalnız bilinen filtre anahtarlarını
 * gateway'e taşır. Nihai doğrulama gateway contract şemasındadır. Store-admin web
 * katmanı contracts'a doğrudan bağlanmaz (sınır api-client üzerinden korunur).
 */
function readShipmentFilters(params: URLSearchParams): ShipmentListQuery {
  const query: ShipmentListQuery = {};
  const search = params.get("search")?.trim();
  if (search) query.search = search;
  const status = params.get("status");
  if (status) query.status = status as ShipmentListQuery["status"];
  const provider = params.get("provider");
  if (provider) query.provider = provider as ShipmentListQuery["provider"];
  const dateFrom = params.get("dateFrom");
  if (dateFrom) query.dateFrom = dateFrom;
  const dateTo = params.get("dateTo");
  if (dateTo) query.dateTo = dateTo;
  const flag = params.get("flag");
  if (flag) query.flag = flag as ShipmentListQuery["flag"];
  const take = params.get("take");
  if (take) query.take = Number(take);
  const skip = params.get("skip");
  if (skip) query.skip = Number(skip);
  return query;
}

/** Mağazanın tüm kargo gönderilerini (provider-agnostic) gateway'den proxy'ler. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = readShipmentFilters(request.nextUrl.searchParams);
  try {
    return NextResponse.json(await createApiClient().admin.shipments.list(ctx.store.id, query, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
