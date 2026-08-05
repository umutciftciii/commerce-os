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
type RetryBody = Parameters<ReturnType<typeof createApiClient>["admin"]["refunds"]["retry"]>[2];

/** TODO-170 (ADR-270) — FAILED refund'ı yeniden dener (optimistic version). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ refundId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { refundId } = await params;
  let body: RetryBody;
  try {
    body = (await request.json()) as RetryBody;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.refunds.retry(ctx.store.id, refundId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
