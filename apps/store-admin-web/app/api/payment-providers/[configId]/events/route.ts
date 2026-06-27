import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Bir provider config'in son olaylarini (attempt/webhook/test/status) proxy'ler. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.paymentProviders.events(ctx.store.id, configId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
