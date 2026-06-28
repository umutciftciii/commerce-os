import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type StoreAdminCustomerUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Müşteri detayını (account + adresler + IBAN + tercihler + siparişler) proxy'ler. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.customers.get(ctx.store.id, id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Müşteri temel bilgi/durum günceller (CSRF zorunlu). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: StoreAdminCustomerUpdateRequest;
  try {
    body = (await request.json()) as StoreAdminCustomerUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.customers.update(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
