import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-165 (ADR-249) — Published çizelgeyi listelenen bir revizyona geri alır. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: { revisionId?: string };
  try {
    body = (await request.json()) as { revisionId?: string };
  } catch {
    return badRequestResponse();
  }
  if (typeof body.revisionId !== "string" || body.revisionId.length === 0) {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.sizeCharts.rollback(ctx.store.id, id, body.revisionId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
