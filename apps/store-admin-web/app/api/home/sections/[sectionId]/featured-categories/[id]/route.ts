import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type HomeFeaturedCategoryUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";


export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sectionId: string; id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId, id } = await params;
  let body: HomeFeaturedCategoryUpdateRequest;
  try {
    body = (await request.json()) as HomeFeaturedCategoryUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.home.featuredCategories.update(ctx.store.id, sectionId, id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sectionId: string; id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId, id } = await params;
  try {
    await createApiClient().admin.home.featuredCategories.remove(ctx.store.id, sectionId, id, ctx.token);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
