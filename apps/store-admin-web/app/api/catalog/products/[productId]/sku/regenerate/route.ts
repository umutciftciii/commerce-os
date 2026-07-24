import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SkuRegenerateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-160A (ADR-109…113) — SKU regenerate proxy'si. Server-authoritative: gateway preview'i yeniden
 * hesaplar ve yalnız değişen (non-protected) SKU'ları TEK transaction'da yazar + AuditLog. CSRF zorunlu.
 * Manuel/imported SKU'lar `onlyAutoSource` (default) veya `force` olmadan KORUNUR.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  let body: SkuRegenerateRequest;
  try {
    body = (await request.json()) as SkuRegenerateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.sku.regenerate(ctx.store.id, productId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
