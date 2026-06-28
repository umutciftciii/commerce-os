import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingProviderConfigUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Provider config'i günceller (status/mode/allow* + displayName). Secret içermez. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ configId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId } = await params;
  let body: ShippingProviderConfigUpdateRequest;
  try {
    body = (await request.json()) as ShippingProviderConfigUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingProviders.update(ctx.store.id, configId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
