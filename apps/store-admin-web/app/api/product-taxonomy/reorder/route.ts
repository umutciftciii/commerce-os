import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductTaxonomyReorderRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-165A (ADR-165A) Task 24 — governed Product Taxonomy siralama proxy'si. Govde `{ type,
 * orderedIds }` tasir — `orderedIds` store+type icin TAM ACTIVE kumeyi kapsamalidir (kismi
 * kume gateway'de 400 TAXONOMY_REORDER_INCOMPLETE ile reddedilir; bu proxy dogrulama yapmaz).
 */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: ProductTaxonomyReorderRequest;
  try {
    body = (await request.json()) as ProductTaxonomyReorderRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.productTaxonomy.reorder(ctx.store.id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
