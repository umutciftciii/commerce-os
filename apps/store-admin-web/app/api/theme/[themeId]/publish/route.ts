import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ThemePublishRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-158B (ADR-087) — Temayı yayınla (yeni PUBLISHED versiyon; tek published tema). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ themeId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { themeId } = await params;
  let body: ThemePublishRequest;
  try {
    body = (await request.json().catch(() => ({}))) as ThemePublishRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.theme.publish(ctx.store.id, themeId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
