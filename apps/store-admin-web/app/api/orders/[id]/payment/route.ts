import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-159F — Sipariş ödeme durumu (kalan bakiye + uygun sağlayıcılar + aktif deneme
 * + geçmiş). Sağlayıcı sonradan aktifleşirse ekran yenilendiğinde aksiyon otomatik
 * görünür (canStartCollection/availableProviders sunucudan türetilir).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.payments.getOrderPayment(ctx.store.id, id, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
