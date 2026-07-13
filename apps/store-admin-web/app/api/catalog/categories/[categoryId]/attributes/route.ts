import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CategoryAttributeCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Faz 1B (ADR-067) — Bir kategoriye bagli attribute davranislarini (CategoryAttribute) listeler. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { categoryId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.categoryAttributes.list(ctx.store.id, categoryId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Bir attribute'u kategoriye baglar (davranis bayraklariyla). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { categoryId } = await params;
  let body: CategoryAttributeCreateRequest;
  try {
    body = (await request.json()) as CategoryAttributeCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.categoryAttributes.create(
      ctx.store.id,
      categoryId,
      body,
      ctx.token,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
