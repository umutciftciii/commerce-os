import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";
import { INFLUENCER_ANALYTICS_KEYS, pickListQuery } from "../../../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/** Kampanya detay dashboard (link satırları + UTM + hedef + seri) — ADR-174 B seviyesi. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  const query = pickListQuery(request.nextUrl.searchParams, INFLUENCER_ANALYTICS_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.influencers.campaignAnalytics(ctx.store.id, id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
