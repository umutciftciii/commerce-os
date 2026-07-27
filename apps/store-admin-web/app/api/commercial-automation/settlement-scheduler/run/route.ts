import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CommercialAutomationRunRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-161A.1 — Settlement scheduler'ı elle çalıştırır. `dryRun=true` yalnız aday
 * raporlar; varsayılan (gövde boş) DRAFT mutabakat oluşturur (yıkıcı değil).
 */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: CommercialAutomationRunRequest;
  try {
    body = (await request.json().catch(() => ({}))) as CommercialAutomationRunRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.commercialAutomation.runSettlementScheduler(ctx.store.id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
