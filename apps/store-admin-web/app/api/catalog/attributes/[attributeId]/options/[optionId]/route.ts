import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AttributeOptionUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Secenegi gunceller (value immutable; label/colorHex/sortOrder/status). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ attributeId: string; optionId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { attributeId, optionId } = await params;
  let body: AttributeOptionUpdateRequest;
  try {
    body = (await request.json()) as AttributeOptionUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.attributes.updateOption(
        ctx.store.id,
        attributeId,
        optionId,
        body,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
