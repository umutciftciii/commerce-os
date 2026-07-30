import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type StoreModuleState } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-163 (ADR-208…ADR-210) — Seçili mağazanın effective modül matrisini gateway'den
 * proxy'ler. Store bağlamı ve token server-side kalır; effective durum + source SUNUCUDA
 * türetilir (istemci override state DIŞINDA yetki gönderemez).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.modules.list(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

const VALID_STATES: ReadonlySet<string> = new Set(["INHERIT", "ENABLED", "DISABLED"]);

/**
 * Bir modül için açık override set eder (CSRF zorunlu). moduleKey body'de taşınır;
 * gateway registry'ye karşı doğrular (bilinmeyen → 404, core → 409).
 */
export async function PUT(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: { moduleKey?: unknown; state?: unknown };
  try {
    body = (await request.json()) as { moduleKey?: unknown; state?: unknown };
  } catch {
    return badRequestResponse();
  }
  const moduleKey = typeof body.moduleKey === "string" ? body.moduleKey : "";
  const state = typeof body.state === "string" ? body.state : "";
  if (!moduleKey || !VALID_STATES.has(state)) {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.modules.setOverride(
        ctx.store.id,
        moduleKey,
        state as StoreModuleState,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
