import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type IdentityApplyRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-150 (ADR-073) — Identity Management Engine APPLY proxy'si. Server-authoritative: gateway
 * preview'i yeniden hesaplar ve yalnız değişen varyantları TEK transaction'da yazar (append-only audit).
 * CSRF zorunlu (mutasyon). Collision/validation blokajında 422 döner; hiçbir şey yazılmaz.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  let body: IdentityApplyRequest;
  try {
    body = (await request.json()) as IdentityApplyRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.identity.apply(ctx.store.id, productId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
