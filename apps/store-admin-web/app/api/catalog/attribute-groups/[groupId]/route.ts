import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AttributeGroupUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Attribute grubunu gunceller. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ groupId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { groupId } = await params;
  let body: AttributeGroupUpdateRequest;
  try {
    body = (await request.json()) as AttributeGroupUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.attributeGroups.update(ctx.store.id, groupId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
