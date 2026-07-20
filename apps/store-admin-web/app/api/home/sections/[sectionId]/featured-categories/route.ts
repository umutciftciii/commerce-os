import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type HomeFeaturedCategoryCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.home.featuredCategories.list(ctx.store.id, sectionId, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId } = await params;
  let body: HomeFeaturedCategoryCreateRequest;
  try {
    body = (await request.json()) as HomeFeaturedCategoryCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.home.featuredCategories.create(ctx.store.id, sectionId, body, ctx.token);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
