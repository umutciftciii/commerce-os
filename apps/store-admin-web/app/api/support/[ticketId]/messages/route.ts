import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type SupportMessageCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";

export const dynamic = "force-dynamic";

/** TODO-177 — Store admin yanıtı (server ticket'ı WAITING_CUSTOMER'a taşır). CSRF korumalı. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { ticketId } = await params;
  let body: SupportMessageCreateRequest;
  try {
    body = (await request.json()) as SupportMessageCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.productSupport.reply(ctx.store.id, ticketId, body, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
