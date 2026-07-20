import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** TODO-158B (ADR-087) — Temayı JSON zarf olarak dışa aktar. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ themeId: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { themeId } = await params;
  try {
    return NextResponse.json(await createApiClient().admin.theme.export(ctx.store.id, themeId, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}
