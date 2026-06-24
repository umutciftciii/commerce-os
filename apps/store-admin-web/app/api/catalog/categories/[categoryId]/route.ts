import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductCategoryUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Kategoriyi gunceller. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { categoryId } = await params;
  let body: ProductCategoryUpdateRequest;
  try {
    body = (await request.json()) as ProductCategoryUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.categories.update(ctx.store.id, categoryId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
