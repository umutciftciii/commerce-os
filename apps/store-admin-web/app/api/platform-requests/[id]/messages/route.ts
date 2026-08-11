import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type StorePlatformRequestMessageCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-178 (Faz D) — Mağaza görünür yanıtı (reply). Visibility client'tan ALINMAZ: gateway daima
 * STORE_VISIBLE yazar (body-only). storeId server-context'ten; cross-store id → gateway 404.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: StorePlatformRequestMessageCreateRequest;
  try {
    body = (await request.json()) as StorePlatformRequestMessageCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().platformRequests.store.reply(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
