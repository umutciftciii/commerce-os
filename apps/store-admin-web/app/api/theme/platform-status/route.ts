import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-164B Dilim 2 — Store Admin: aktif platform teması durumu (banner). managedByPlatform,
 * current/template sürüm, update-available, editable/locked alanlar. Salt-okuma proxy.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.theme.platformStatus(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
