import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-161A.1 — Ticari otomasyon (settlement scheduler + retention) durumunu proxy'ler. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(
      await createApiClient().admin.commercialAutomation.getStatus(ctx.store.id, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
