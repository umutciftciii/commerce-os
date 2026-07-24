import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SponsorshipChargeIssueRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-161A — Taslak tahakkuku düzenler (ISSUED + vade). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: SponsorshipChargeIssueRequest;
  try {
    body = (await request.json().catch(() => ({}))) as SponsorshipChargeIssueRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.sponsorship.issueCharge(ctx.store.id, id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
