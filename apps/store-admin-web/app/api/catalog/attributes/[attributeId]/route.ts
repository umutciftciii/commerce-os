import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AttributeDefinitionUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Tek attribute tanimini getirir (STORE-own veya PLATFORM okuma). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attributeId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { attributeId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.attributes.get(ctx.store.id, attributeId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** STORE attribute tanimini gunceller (code immutable; dataType kullanimda immutable). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ attributeId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { attributeId } = await params;
  let body: AttributeDefinitionUpdateRequest;
  try {
    body = (await request.json()) as AttributeDefinitionUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.attributes.update(ctx.store.id, attributeId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
