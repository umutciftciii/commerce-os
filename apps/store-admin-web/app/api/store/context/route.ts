import { NextResponse, type NextRequest } from "next/server";
import { requireStoreContext } from "../../../../lib/server/store-context";

export const dynamic = "force-dynamic";

/**
 * Secili mağaza bağlamini (id/ad/slug/durum) doner. Token istemciye sizmaz;
 * yalnizca mağaza kimligi dondurulur.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) {
    return ctx.response;
  }
  return NextResponse.json({ store: ctx.store });
}
