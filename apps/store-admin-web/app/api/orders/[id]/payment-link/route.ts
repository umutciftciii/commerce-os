import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CreatePaymentLinkRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-159F — Sipariş için ödeme bağlantısı (session) oluşturur. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: CreatePaymentLinkRequest = {};
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object") body = raw as CreatePaymentLinkRequest;
  } catch {
    // Gövde opsiyonel: sağlayıcı verilmezse sunucu otomatik seçer.
  }
  try {
    const result = await createApiClient().admin.payments.createLink(ctx.store.id, id, body, ctx.token);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
