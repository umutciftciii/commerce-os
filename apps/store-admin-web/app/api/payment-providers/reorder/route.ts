import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type PaymentProviderReorderRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Provider önceliklerini toplu günceller (öncelik sırasi resolver'i belirler). */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: PaymentProviderReorderRequest;
  try {
    body = (await request.json()) as PaymentProviderReorderRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.paymentProviders.reorder(ctx.store.id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
