import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-124 — CBS il listesi (varış eşleme/onarım dropdown'ı). Gateway TTL cache'i
 * kullanır; sağlayıcı aşırı çağrılmaz. Yanıt yalnız {code,name} taşır (secret yok).
 */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: { providerConfigId?: string };
  try {
    body = (await request.json()) as { providerConfigId?: string };
  } catch {
    return badRequestResponse();
  }
  if (!body.providerConfigId) return badRequestResponse();
  try {
    return NextResponse.json(
      await createApiClient().admin.cbs.cities(ctx.store.id, body.providerConfigId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
