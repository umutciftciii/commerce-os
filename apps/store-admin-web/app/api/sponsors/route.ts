import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SponsorAccountCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";
import { SPONSOR_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/** TODO-161A — Sponsor firma listesini gateway'den proxy'ler. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, SPONSOR_LIST_KEYS);
  try {
    return NextResponse.json(await createApiClient().admin.sponsorship.listSponsors(ctx.store.id, ctx.token, query));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni sponsor firma oluşturur. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: SponsorAccountCreateRequest;
  try {
    body = (await request.json()) as SponsorAccountCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.sponsorship.createSponsor(ctx.store.id, body, ctx.token), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
