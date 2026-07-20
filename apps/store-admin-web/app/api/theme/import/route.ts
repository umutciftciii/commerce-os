import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ThemeImportRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-158B (ADR-087) — Tema import (yeni tema; gateway importTheme doğrular). */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: ThemeImportRequest;
  try {
    body = (await request.json()) as ThemeImportRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.theme.import(ctx.store.id, body, ctx.token);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
