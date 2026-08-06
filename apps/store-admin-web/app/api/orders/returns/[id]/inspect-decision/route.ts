import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminReturnInspectRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
} from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TD-FR-7 Faz 1 / Task 4/5 — "İadeyi yap": inceleme kararı + (kabul edilen adet varsa)
 * refund başlatma TEK aksiyonda. İstek gövdesi `/inspect` ile aynı şekli paylaşır
 * (AdminReturnInspectRequest); gateway `adminReturnInspectRequestSchema`'yı reuse eder.
 * Refund orkestrasyonu başarısız olursa gateway 4xx döner (inceleme kararı ZATEN commit
 * edilmiştir, geri alınmaz) — errorResponse `details.refundErrorCode`'u aynen taşır.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: AdminReturnInspectRequest;
  try {
    body = (await request.json()) as AdminReturnInspectRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.inspectDecision(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
