import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// Gövde tipi api-client metodundan türetilir (contracts'a doğrudan bağlanmadan).
type AdvanceCreateInput = Parameters<
  ReturnType<typeof createApiClient>["admin"]["sponsorship"]["createAdvance"]
>[2];

/**
 * TODO-161A.2 (ADR-129) — Anlaşmaya bağlı avans (tahakkuka mahsup edilmemiş nakit) kaydeder.
 * Kullanılabilir bakiye türetilir; sonradan açık tahakkuklara mahsup edilir.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: AdvanceCreateInput;
  try {
    body = (await request.json()) as AdvanceCreateInput;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.sponsorship.createAdvance(ctx.store.id, id, body, ctx.token),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
