import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ThemeRollbackRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-158B (ADR-087) — Bir versiyonu yeni draft olarak geri yükle. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ themeId: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { themeId } = await params;
  let body: ThemeRollbackRequest;
  try {
    body = (await request.json()) as ThemeRollbackRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.theme.rollback(ctx.store.id, themeId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
