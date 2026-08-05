import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
} from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// Request tipi api-client'ta re-export EDİLMEDİĞİNDEN client metod imzasından türetilir
// (api-client sınırını koruyarak; contracts'a doğrudan bağlanmadan).
type InitiateBody = Parameters<
  ReturnType<typeof createApiClient>["admin"]["refunds"]["initiate"]
>[2];

/** TODO-170 (ADR-270) — Para iadesini başlat (intent PENDING → refund kaydı; optimistic version). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: InitiateBody;
  try {
    body = (await request.json()) as InitiateBody;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.refunds.initiate(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
