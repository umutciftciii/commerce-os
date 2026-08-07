import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type RecoveryActionRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-174B (ADR-283) — Recovery lifecycle aksiyonu (assign/contact/outcome/resolve/close; CSRF zorunlu). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ caseId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { caseId } = await params;
  let body: RecoveryActionRequest;
  try {
    body = (await request.json()) as RecoveryActionRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.orderExperience.action(ctx.store.id, caseId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
