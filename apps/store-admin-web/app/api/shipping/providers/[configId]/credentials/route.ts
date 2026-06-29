import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingCredentialUpsertRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Credential upsert. Secret yalnızca burada plain alınır; gateway encrypt eder, yanıt maskeli döner. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ configId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId } = await params;
  let body: ShippingCredentialUpsertRequest;
  try {
    body = (await request.json()) as ShippingCredentialUpsertRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingProviders.upsertCredential(ctx.store.id, configId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
