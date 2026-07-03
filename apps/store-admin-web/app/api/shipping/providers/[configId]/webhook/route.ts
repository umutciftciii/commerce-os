import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-128 — Sağlayıcı webhook durumu/URL'si + son olaylar (gateway proxy). Güvenli DTO:
 * secret/raw payload/imza/encrypted secret DÖNMEZ. Tam webhook URL'si yalnızca bu tekil
 * yetkili uçtan gelir. `limit` query'si opsiyonel (gateway varsayılan 20, üst sınır 50).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ configId: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId } = await params;
  const rawLimit = request.nextUrl.searchParams.get("limit");
  const parsedLimit = rawLimit === null ? undefined : Number(rawLimit);
  const limit = typeof parsedLimit === "number" && Number.isFinite(parsedLimit) ? parsedLimit : undefined;
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingProviders.webhookInfo(ctx.store.id, configId, ctx.token, limit),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
