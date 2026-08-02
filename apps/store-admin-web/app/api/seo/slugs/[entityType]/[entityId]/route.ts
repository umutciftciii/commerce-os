import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-166 (ADR-265) — Bir entity'nin slug detayı + geçmişi (detay drawer). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityType: string; entityId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { entityType, entityId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.slugs.get(ctx.store.id, entityType, entityId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
