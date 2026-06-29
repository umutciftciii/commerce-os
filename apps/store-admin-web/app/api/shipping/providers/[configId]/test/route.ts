import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Bağlantı testi. Bu fazda canlı HTTP kapalı; credential format doğrulanır. Secret dönmez. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ configId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingProviders.test(ctx.store.id, configId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
