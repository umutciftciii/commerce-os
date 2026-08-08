import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TD-174B-1 — Tek-sipariş "Sipariş Deneyimi" özeti (order-detail kartı). Review yoksa null. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orderId: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { orderId } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.orderExperience.byOrder(ctx.store.id, orderId, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
