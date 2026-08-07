import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminAdjustCreditRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-174B — Manuel bakiye düzeltmesi (CREDIT ekle / DEBIT çıkar; SUPER_ADMIN; CSRF zorunlu). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: AdminAdjustCreditRequest;
  try {
    body = (await request.json()) as AdminAdjustCreditRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.customerCredit.adjust(ctx.store.id, id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
