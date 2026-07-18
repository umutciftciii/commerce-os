import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CommercialPreviewRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { badRequestResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-151 (ADR-074) — Commercial Engine PREVIEW proxy'si. YALNIZ OKUMA + deterministik: hiçbir varyant
 * yazılmaz. Rule veya direct-edit gövdeden okunur; gateway server-authoritative hesabı yapar ve
 * blocking/warning'i döner. Preview mutasyon DEĞİL → CSRF gerekmez.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ productId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { productId } = await params;
  let body: CommercialPreviewRequest;
  try {
    body = (await request.json()) as CommercialPreviewRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.products.commercial.preview(ctx.store.id, productId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
