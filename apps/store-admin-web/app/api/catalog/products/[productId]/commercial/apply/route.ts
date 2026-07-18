import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CommercialApplyRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-151 (ADR-074) — Commercial Engine APPLY proxy'si. Server-authoritative: gateway preview'i tek
 * transaction'da yeniden hesaplar (advisory-lock + stale-guard) ve yalnız değişen alanları yazar
 * (append-only audit). CSRF zorunlu (mutasyon). Stale → 409; blocking → 422; hiçbir kısmi yazım olmaz.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  let body: CommercialApplyRequest;
  try {
    body = (await request.json()) as CommercialApplyRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.commercial.apply(ctx.store.id, productId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
