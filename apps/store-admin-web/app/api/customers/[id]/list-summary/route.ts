import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-159D (ADR-093) — Müşteri liste/wishlist SALT-OKUNUR özetini proxy'ler.
 * Yalnız asgari sayaç/tarih (liste sayısı, wishlist öğe sayısı, son eklenen tarih);
 * öğe içeriği/davranış takibi DÖNMEZ (gizlilik). Platform-admin + store scope gateway'de.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.customers.getListSummary(ctx.store.id, id, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
