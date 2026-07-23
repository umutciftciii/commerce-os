import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type RecordManualPaymentRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-159F — Offline (banka/nakit/POS/diğer) tahsilatı kaydeder. Sunucu-otoriter tutar. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: RecordManualPaymentRequest;
  try {
    body = (await request.json()) as RecordManualPaymentRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.payments.recordManualPayment(
      ctx.store.id,
      id,
      body,
      ctx.token,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
