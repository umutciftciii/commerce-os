import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ManualOpenCaseRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-174B (ADR-283) — 3★ değerlendirme için manuel recovery case açar (CSRF zorunlu). */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: ManualOpenCaseRequest;
  try {
    body = (await request.json()) as ManualOpenCaseRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.orderExperience.openManual(ctx.store.id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
