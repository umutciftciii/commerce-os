import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { errorResponse } from "../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-170-recovery — Bekleyen İş Özeti'ni gateway'den proxy'ler. Store bağlamı server-side
 * çözülür (token tarayıcıya sızmaz). Sidebar sayaçları + Dashboard "Bekleyen İşler" kartı bunu
 * kullanır; bounded aggregate olduğundan her menü item için ayrı istek yapılmaz.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.pendingWork.get(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
