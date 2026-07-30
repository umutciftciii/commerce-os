import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-164A — Temayı arşivle (PUBLISHED arşivlenemez → 409). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ themeId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { themeId } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.theme.archive(ctx.store.id, themeId, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
