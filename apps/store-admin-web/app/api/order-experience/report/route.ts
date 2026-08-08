import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TD-174B-2 — Recovery raporu (trend + zamanlama + outcome + goodwill) proxy'si. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query: Record<string, string> = {};
  for (const k of ["period", "dateFrom", "dateTo"]) {
    const v = request.nextUrl.searchParams.get(k);
    if (v != null && v !== "") query[k] = v;
  }
  try {
    return NextResponse.json(await createApiClient().admin.orderExperience.report(ctx.store.id, ctx.token, query));
  } catch (error) {
    return errorResponse(error);
  }
}
