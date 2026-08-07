import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminReturnDispositionCancelRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
} from "../../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// TODO-173 (ADR-274) — disposition iptal (PENDING → CANCELLED; quantity serbest).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; dispositionId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, dispositionId } = await params;
  let body: AdminReturnDispositionCancelRequest;
  try {
    body = (await request.json()) as AdminReturnDispositionCancelRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.cancelDisposition(ctx.store.id, id, dispositionId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
