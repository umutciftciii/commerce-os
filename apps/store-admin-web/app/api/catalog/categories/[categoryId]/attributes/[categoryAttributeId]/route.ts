import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CategoryAttributeUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Kategori-attribute davranisini gunceller. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string; categoryAttributeId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { categoryId, categoryAttributeId } = await params;
  let body: CategoryAttributeUpdateRequest;
  try {
    body = (await request.json()) as CategoryAttributeUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.categoryAttributes.update(
        ctx.store.id,
        categoryId,
        categoryAttributeId,
        body,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Bir attribute'u kategoriden cikarir (unlink). */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string; categoryAttributeId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { categoryId, categoryAttributeId } = await params;
  try {
    await createApiClient().admin.categoryAttributes.remove(
      ctx.store.id,
      categoryId,
      categoryAttributeId,
      ctx.token,
    );
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
