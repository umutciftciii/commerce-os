import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";
import { buildActivationLink } from "../../../../../../lib/server/activation-link";

export const dynamic = "force-dynamic";

/**
 * Credential'i olan müşteri için parola sıfırlama: gateway ADMIN_PASSWORD_RESET
 * token üretir; tek seferlik linke çevirip döneriz (CSRF zorunlu). Parola yeni
 * link ile belirlenince mevcut tüm oturumlar gateway tarafında revoke edilir.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    const result = await createApiClient().admin.customers.resetCredential(ctx.store.id, id, ctx.token);
    return NextResponse.json({ activation: buildActivationLink(result.setup) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
