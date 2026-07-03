import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-128/104 — Webhook secret/token'ı yeniler. Yeni secret gateway yanıtında YALNIZ BİR
 * KEZ düz döner (ADR-035 deseni); DB'de AES-256-GCM şifreli saklanır. Bu proxy secret'ı
 * loglamaz/saklamaz; yanıtı olduğu gibi istemciye geçirir (istemci bir kez gösterir).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ configId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { configId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingProviders.rotateWebhook(ctx.store.id, configId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
