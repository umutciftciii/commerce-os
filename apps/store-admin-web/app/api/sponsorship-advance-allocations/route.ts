import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";

export const dynamic = "force-dynamic";

// Gövde tipi api-client metodundan türetilir (contracts'a doğrudan bağlanmadan).
type AllocationInput = Parameters<
  ReturnType<typeof createApiClient>["admin"]["sponsorship"]["allocateAdvance"]
>[1];

/**
 * TODO-161A.2 (ADR-129) — Kullanılabilir avansı açık bir tahakkuğa mahsup eder (append-only).
 * `expectedRemainingMinor` iyimser kilit; sunucudaki kalanla uyuşmazsa BALANCE_CHANGED döner.
 */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: AllocationInput;
  try {
    body = (await request.json()) as AllocationInput;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.sponsorship.allocateAdvance(ctx.store.id, body, ctx.token),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
