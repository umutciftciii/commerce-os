import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-165 (ADR-249) — Bir kapsam atamasını kaldırır. Güncel çizelgeyi ({ data }) döner. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, assignmentId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.sizeCharts.unassign(ctx.store.id, id, assignmentId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
