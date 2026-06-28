import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Bir credential tipini temizler. */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string; type: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId, type } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingProviders.deleteCredential(ctx.store.id, configId, type, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
