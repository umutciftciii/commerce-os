import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type HomeSectionReorderRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";


/** Section siralama proxy'si (uyumsuz set → 400 HOME_SECTION_REORDER_MISMATCH). */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: HomeSectionReorderRequest;
  try {
    body = (await request.json()) as HomeSectionReorderRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.home.sections.reorder(ctx.store.id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
