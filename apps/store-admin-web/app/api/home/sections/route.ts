import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type HomeSectionCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";


/** TODO-158A (ADR-086) — Home section listesi (gateway proxy). */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.home.sections.list(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni section olusturur. Govde dogrulamasi gateway Zod kontratina birakilir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: HomeSectionCreateRequest;
  try {
    body = (await request.json()) as HomeSectionCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.home.sections.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
