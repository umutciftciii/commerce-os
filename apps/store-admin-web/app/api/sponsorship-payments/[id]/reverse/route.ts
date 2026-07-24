import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SponsorshipPaymentReverseRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-161A — Tahsilatı ters çevirir (append-only negatif satır). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: SponsorshipPaymentReverseRequest;
  try {
    body = (await request.json().catch(() => ({}))) as SponsorshipPaymentReverseRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.sponsorship.reversePayment(ctx.store.id, id, body, ctx.token), { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
