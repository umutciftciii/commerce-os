import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingCbsDistrictsRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-124 — CBS ilçe listesi (seçilen il için; varış eşleme/onarım dropdown'ı).
 * Gateway TTL cache'i kullanır. Yanıt yalnız {code,name,cityCode} taşır (secret yok).
 */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: ShippingCbsDistrictsRequest;
  try {
    body = (await request.json()) as ShippingCbsDistrictsRequest;
  } catch {
    return badRequestResponse();
  }
  if (!body.providerConfigId || !body.cityCode) return badRequestResponse();
  try {
    return NextResponse.json(await createApiClient().admin.cbs.districts(ctx.store.id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
