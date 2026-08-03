import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AdminReturnTransitionRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
} from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-169 (ADR-269) — Basit iade durum geçişi (incelemeye al / gönderim bekleniyor /
 * teslim alındı / refund|replacement pending / kapat). State-machine + yetki gateway'de.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: AdminReturnTransitionRequest;
  try {
    body = (await request.json()) as AdminReturnTransitionRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.returns.transition(ctx.store.id, id, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
