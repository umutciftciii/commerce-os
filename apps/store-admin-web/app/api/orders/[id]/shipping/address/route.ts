import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingAddressUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-139 — Sipariş teslimat adresi SNAPSHOT'ını düzenleme. Bu MÜŞTERİ adres defterini
 * DEĞİL, yalnız bu siparişin (OrderAddress SHIPPING + varsa Shipment alıcı snapshot'ı)
 * teslimat adresini günceller. il/ilçe kodu gateway'de CBS'e karşı YENİDEN doğrulanır;
 * gönderi taşınırken/teslim edildikten sonra SHIPMENT_ADDRESS_LOCKED (409) döner.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ShippingAddressUpdateRequest;
  try {
    body = (await request.json()) as ShippingAddressUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.orderShipping.updateAddress(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
