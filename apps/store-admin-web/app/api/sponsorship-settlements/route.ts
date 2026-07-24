import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { errorResponse } from "../../../lib/server/respond";
import { SPONSORSHIP_SETTLEMENT_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/** TODO-161A — Mutabakat listesini proxy'ler. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, SPONSORSHIP_SETTLEMENT_LIST_KEYS);
  try {
    return NextResponse.json(await createApiClient().admin.sponsorship.listSettlements(ctx.store.id, ctx.token, query));
  } catch (error) {
    return errorResponse(error);
  }
}
