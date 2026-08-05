import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
} from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// Request tipi api-client'ta re-export EDİLMEDİĞİNDEN client metod imzasından türetilir.
type ManualCompleteBody = Parameters<
  ReturnType<typeof createApiClient>["admin"]["refunds"]["manualComplete"]
>[2];

/** TODO-170 (ADR-270) — MANUAL_OFFLINE PENDING refund'ı manuel tamamlar (banka/dekont referansı zorunlu). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ refundId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { refundId } = await params;
  let body: ManualCompleteBody;
  try {
    body = (await request.json()) as ManualCompleteBody;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.refunds.manualComplete(ctx.store.id, refundId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
