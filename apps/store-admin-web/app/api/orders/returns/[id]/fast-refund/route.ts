import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminReturnFastRefundRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
} from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-172 (ADR-273) — "Hızlı iade yap": teslim alma + inceleme atlanarak doğrudan para iadesi.
 * AYRI güçlü yetki (gateway'de SUPER_ADMIN zorunlu; yetki yetersizse 403). Limit/currency/intent
 * sunucu-otoriter; body yalnız reason + expectedVersion taşır (tutar/limit client'tan gönderilmez).
 * Refund orkestrasyonu başlatma hatası verirse gateway 4xx döner (geçiş zaten commit edilmiştir).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: AdminReturnFastRefundRequest;
  try {
    body = (await request.json()) as AdminReturnFastRefundRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.fastRefund(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
