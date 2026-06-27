import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type PaymentProviderConfigCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * Secili mağazanin ödeme sağlayici config'lerini gateway'den proxy'ler.
 * Secret alanlar gateway tarafinda maskelidir; bu katman yalnizca pass-through yapar.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.paymentProviders.list(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni ödeme sağlayici config'i olusturur. Secret'lar gateway'de encrypt edilir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: PaymentProviderConfigCreateRequest;
  try {
    body = (await request.json()) as PaymentProviderConfigCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.paymentProviders.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
