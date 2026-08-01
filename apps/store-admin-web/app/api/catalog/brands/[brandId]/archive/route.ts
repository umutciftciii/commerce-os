import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-165A (ADR-165A) Task 15/16 — Markayı arşivler (ARCHIVED). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ brandId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { brandId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.brands.archive(ctx.store.id, brandId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
