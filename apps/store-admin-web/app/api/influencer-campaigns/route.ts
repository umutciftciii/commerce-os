import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type InfluencerCampaignCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";
import { INFLUENCER_CAMPAIGN_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/** TODO-160 — Influencer kampanya dizinini (opsiyonel influencerId filtresi) proxy'ler. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, INFLUENCER_CAMPAIGN_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.influencers.listCampaigns(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni influencer kampanyası oluşturur (atıf penceresi + opsiyonel tarih aralığı). */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: InfluencerCampaignCreateRequest;
  try {
    body = (await request.json()) as InfluencerCampaignCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.influencers.createCampaign(
      ctx.store.id,
      body,
      ctx.token,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
