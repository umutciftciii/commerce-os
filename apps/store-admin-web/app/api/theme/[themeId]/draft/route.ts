import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ThemeDraftUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-158B (ADR-087) — Draft belgeyi kaydet (gateway @commerce-os/theme doğrular). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ themeId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { themeId } = await params;
  let body: ThemeDraftUpdateRequest;
  try {
    body = (await request.json()) as ThemeDraftUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.theme.saveDraft(ctx.store.id, themeId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
