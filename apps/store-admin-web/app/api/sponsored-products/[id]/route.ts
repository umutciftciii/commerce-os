import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SponsoredCampaignUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-161 — Sponsorlu kampanya detayını (özet + ürünler + keyword'ler) proxy'ler. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.sponsoredProducts.get(ctx.store.id, id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Sponsorlu kampanyayı günceller (ürün/keyword atomik replace-set). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: SponsoredCampaignUpdateRequest;
  try {
    body = (await request.json()) as SponsoredCampaignUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.sponsoredProducts.update(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
