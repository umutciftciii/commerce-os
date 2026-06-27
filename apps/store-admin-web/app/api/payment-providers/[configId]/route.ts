import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type PaymentProviderConfigUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Tek bir provider config'in (maskeli) detayini proxy'ler. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.paymentProviders.get(ctx.store.id, configId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Provider config'i gunceller. Secret semantigi gateway'de uygulanir: alan
 * gonderilmezse mevcut secret KORUNUR, dolu gonderilirse DEGISTIRILIR.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ configId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId } = await params;
  let body: PaymentProviderConfigUpdateRequest;
  try {
    body = (await request.json()) as PaymentProviderConfigUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.paymentProviders.update(ctx.store.id, configId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
