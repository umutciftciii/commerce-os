import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TD-130 — Recommendation Measurement görünürlük özetini proxy'ler (platform-admin, store-scope). */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const params = request.nextUrl.searchParams;
  const query: Record<string, string> = {};
  for (const key of ["from", "to", "source", "placement"]) {
    const value = params.get(key);
    if (value) query[key] = value;
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.recommendations.summary(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
