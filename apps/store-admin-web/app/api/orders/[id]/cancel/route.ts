import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type OrderCancelRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Siparişi iptal eder; aktif stok rezervasyonlari backend'de serbest birakilir. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  // Govde opsiyonel: iptal nedeni gonderilmeyebilir. Bos/gecersiz govde guvenli sekilde {} olur.
  let body: OrderCancelRequest = {};
  try {
    const raw: unknown = await request.json();
    if (raw && typeof raw === "object") body = raw as OrderCancelRequest;
  } catch {
    // Govde yok/JSON degil: nedensiz iptal olarak devam edilir.
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.orders.cancel(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
