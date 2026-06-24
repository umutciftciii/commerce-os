import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ProductVariantCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Bir urunun varyantlarini listeler. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.products.variants.list(ctx.store.id, productId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni varyant olusturur (stok kaydi gateway tarafinda otomatik acilir). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  let body: ProductVariantCreateRequest;
  try {
    body = (await request.json()) as ProductVariantCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const variant = await createApiClient().admin.products.variants.create(
      ctx.store.id,
      productId,
      body,
      ctx.token,
    );
    return NextResponse.json(variant, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
