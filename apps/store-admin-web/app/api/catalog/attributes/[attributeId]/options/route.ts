import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AttributeOptionCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Bir attribute tanimimin seceneklerini listeler (SELECT/MULTI_SELECT/COLOR). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attributeId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { attributeId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.attributes.listOptions(ctx.store.id, attributeId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni secenek olusturur (yalniz STORE-own tanim; duplicate value gateway'de 409). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ attributeId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { attributeId } = await params;
  let body: AttributeOptionCreateRequest;
  try {
    body = (await request.json()) as AttributeOptionCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.attributes.createOption(
      ctx.store.id,
      attributeId,
      body,
      ctx.token,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
