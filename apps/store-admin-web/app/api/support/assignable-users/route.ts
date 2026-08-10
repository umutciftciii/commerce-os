import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-177 — "Kullanıcıya ata" dropdown'u; store'un yetkili kullanıcıları (server-side scope). */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.productSupport.assignableUsers(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
