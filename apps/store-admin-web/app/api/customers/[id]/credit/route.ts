import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminIssueCreditRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-174B (ADR-281) — Müşteri alışveriş bakiyesi + hareket geçmişi. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  const query: Record<string, string> = {};
  const currency = request.nextUrl.searchParams.get("currency");
  if (currency) query.currency = currency;
  try {
    return NextResponse.json(await createApiClient().admin.customerCredit.balance(ctx.store.id, id, ctx.token, query));
  } catch (error) {
    return errorResponse(error);
  }
}

/** TODO-174B (ADR-281) — Goodwill kredi tanımla (policy-gated; CSRF zorunlu). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: AdminIssueCreditRequest;
  try {
    body = (await request.json()) as AdminIssueCreditRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.customerCredit.issue(ctx.store.id, id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
