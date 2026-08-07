import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminReturnListQuery } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-169 (ADR-269) — İade listesi proxy'si. İstemci query string'inden yalnız bilinen
 * filtre anahtarları seçilir; nihai doğrulama (enum/limit/allowlist) gateway'de contract
 * şemasıyla yapılır. Store bağlamı server-side çözülür (requireStorePlatformAdmin gateway'de).
 */
function readReturnFilters(params: URLSearchParams): AdminReturnListQuery {
  const query: AdminReturnListQuery = {};
  const status = params.get("status");
  if (status) query.status = status as AdminReturnListQuery["status"];
  const resolutionType = params.get("resolutionType");
  if (resolutionType) query.resolutionType = resolutionType as AdminReturnListQuery["resolutionType"];
  const reason = params.get("reason");
  if (reason) query.reason = reason as AdminReturnListQuery["reason"];
  // TODO-174A — kaynak filtresi (İade talebi / Sipariş iptali).
  const source = params.get("source");
  if (source) query.source = source as AdminReturnListQuery["source"];
  const orderNumber = params.get("orderNumber")?.trim();
  if (orderNumber) query.orderNumber = orderNumber;
  const search = params.get("search")?.trim();
  if (search) query.search = search;
  const overdue = params.get("overdue");
  if (overdue === "true" || overdue === "false") query.overdue = overdue;
  const sortBy = params.get("sortBy");
  if (sortBy) query.sortBy = sortBy as AdminReturnListQuery["sortBy"];
  const sortOrder = params.get("sortOrder");
  if (sortOrder) query.sortOrder = sortOrder as AdminReturnListQuery["sortOrder"];
  const page = params.get("page");
  if (page) query.page = Number(page);
  const pageSize = params.get("pageSize");
  if (pageSize) query.pageSize = Number(pageSize);
  return query;
}

export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = readReturnFilters(request.nextUrl.searchParams);
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.list(ctx.store.id, query, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
