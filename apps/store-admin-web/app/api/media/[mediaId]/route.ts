import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * ADR-065 Faz 2 (Dilim 1) — Media silme proxy'si.
 *
 * Basarida 204 (govde yok). Gorsel bir entity'ye bagliysa gateway 409 MEDIA_IN_USE
 * doner; `error.details.usedIn` (hangi tablolar) errorResponse ile UI'a tasinir.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ mediaId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;

  const { mediaId } = await params;
  try {
    await createApiClient().admin.media.remove(ctx.store.id, mediaId, ctx.token);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
