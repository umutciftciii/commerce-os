import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductVariantUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Varyanti gunceller. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string; variantId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId, variantId } = await params;
  let body: ProductVariantUpdateRequest;
  try {
    body = (await request.json()) as ProductVariantUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.variants.update(
        ctx.store.id,
        productId,
        variantId,
        body,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
