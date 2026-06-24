import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Tek bir urunun detayini (satis davranisi alanlari dahil) proxy'ler. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.products.get(ctx.store.id, productId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Urunu gunceller (durum, kategori atamasi vb.). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  let body: ProductUpdateRequest;
  try {
    body = (await request.json()) as ProductUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.update(ctx.store.id, productId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
