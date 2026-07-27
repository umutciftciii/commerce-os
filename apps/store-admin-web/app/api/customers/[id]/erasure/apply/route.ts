import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TD-131 — Kişisel veri silme APPLY (geri alınamaz): onay ifadesi + neden zorunlu. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    const body = (await request.json()) as { confirmationPhrase?: string; reason?: string };
    return NextResponse.json(
      await createApiClient().admin.customers.erasureApply(
        ctx.store.id,
        id,
        { confirmationPhrase: body.confirmationPhrase ?? "", reason: body.reason ?? "" },
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
