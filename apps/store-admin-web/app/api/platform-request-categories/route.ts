import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { errorResponse } from "../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-178 (Faz D) — Store create/filtre için AKTİF taksonomi (yalnız key + bilingual label). Platform
 * `/platform/request-categories` ucu requirePlatform'dur; store bu store-scoped uçtan okur.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(
      await createApiClient().platformRequests.store.categories(ctx.store.id, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
