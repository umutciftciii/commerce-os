import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductTaxonomyUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Tekil governed taksonomi degerini getirir. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ valueId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { valueId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.productTaxonomy.get(ctx.store.id, valueId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Ad/metadata/parentId gunceller (slug IMMUTABLE — gateway'de korunur). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ valueId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { valueId } = await params;
  let body: ProductTaxonomyUpdateRequest;
  try {
    body = (await request.json()) as ProductTaxonomyUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.productTaxonomy.update(ctx.store.id, valueId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Degeri kalici siler. Kullanimdaysa gateway 409 TAXONOMY_IN_USE doner (govde JSON olarak
 * gecirilir; UI bunu "kullanımda, silinemez" mesajina cevirir). Basarida 204 (govde yok).
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ valueId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { valueId } = await params;
  try {
    await createApiClient().admin.productTaxonomy.delete(ctx.store.id, valueId, ctx.token);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
