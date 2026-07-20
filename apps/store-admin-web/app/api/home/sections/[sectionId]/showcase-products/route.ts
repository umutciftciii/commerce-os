import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type HomeShowcaseProductSetRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.home.showcaseProducts.list(ctx.store.id, sectionId, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId } = await params;
  let body: HomeShowcaseProductSetRequest;
  try {
    body = (await request.json()) as HomeShowcaseProductSetRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.home.showcaseProducts.set(ctx.store.id, sectionId, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
