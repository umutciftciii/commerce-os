import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-172 (ADR-273) — Fast Refund onay modalı için bounded risk/uygunluk özeti proxy'si
 * (permission/enabled/limit/skippedSteps + müşteri sipariş/iade sayıları). Salt-okunur.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.fastRefundContext(ctx.store.id, id, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
