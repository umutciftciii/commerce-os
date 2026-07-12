import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type StoreSettingsUpdateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

// ADR-065 (Faz 2/Dilim 4) — Magaza marka ayarlari (logo/favicon). GET lazy (tum-null),
// PATCH upsert. Kaynak YENI (kategori/urun update'inden farkli olarak burada tekil bir
// singleton var); gateway'e requireStoreContext token'iyla proxy'lenir.
export const dynamic = "force-dynamic";

/** Magaza marka ayarlarini proxy'ler (satir yoksa gateway tum-null doner). */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.settings.get(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Marka ayarlarini gunceller (logo/favicon bagla veya null ile kaldir). */
export async function PATCH(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: StoreSettingsUpdateRequest;
  try {
    body = (await request.json()) as StoreSettingsUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.settings.update(ctx.store.id, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
