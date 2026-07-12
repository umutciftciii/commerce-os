import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type HeroSlideReorderRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * ADR-065 Faz 2 (Dilim 5, Checkpoint B) — Hero slide siralama proxy'si. Sirali id
 * listesi gateway'e iletilir; uyumsuz set 400 HERO_REORDER_MISMATCH doner.
 */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: HeroSlideReorderRequest;
  try {
    body = (await request.json()) as HeroSlideReorderRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.heroSlides.reorder(ctx.store.id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
