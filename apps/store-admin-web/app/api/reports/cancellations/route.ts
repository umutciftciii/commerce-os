import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";
import { CANCELLATION_REPORT_KEYS, pickListQuery } from "../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/** TODO-174 (ADR-275) — İptal raporu (yalnız görüntüleme; taksonomi CRUD yok) proxy'si. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, CANCELLATION_REPORT_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.finance.cancellations(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
