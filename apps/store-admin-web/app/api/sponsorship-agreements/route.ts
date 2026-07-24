import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SponsorshipAgreementCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";
import { SPONSORSHIP_AGREEMENT_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/** TODO-161A — Sponsorluk anlaşması listesini proxy'ler. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, SPONSORSHIP_AGREEMENT_LIST_KEYS);
  try {
    return NextResponse.json(await createApiClient().admin.sponsorship.listAgreements(ctx.store.id, ctx.token, query));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni anlaşma oluşturur. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: SponsorshipAgreementCreateRequest;
  try {
    body = (await request.json()) as SponsorshipAgreementCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.sponsorship.createAgreement(ctx.store.id, body, ctx.token), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
