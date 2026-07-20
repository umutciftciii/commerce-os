import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type HomeSectionUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";


export async function GET(request: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.home.sections.get(ctx.store.id, sectionId, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId } = await params;
  let body: HomeSectionUpdateRequest;
  try {
    body = (await request.json()) as HomeSectionUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.home.sections.update(ctx.store.id, sectionId, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ sectionId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { sectionId } = await params;
  try {
    await createApiClient().admin.home.sections.remove(ctx.store.id, sectionId, ctx.token);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
