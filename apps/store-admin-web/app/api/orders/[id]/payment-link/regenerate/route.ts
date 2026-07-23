import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CreatePaymentLinkRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-159F — Ödeme bağlantısını yeniler (eski aktif link iptal, geçmiş korunur). */
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
    // Gövde opsiyonel.
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.payments.regenerateLink(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
