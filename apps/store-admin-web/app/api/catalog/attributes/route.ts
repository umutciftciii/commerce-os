import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type AttributeDefinitionCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Faz 1B (ADR-067) — Secili magazanin attribute tanimlarini (STORE + PLATFORM) proxy'ler. */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  try {
    return NextResponse.json(await createApiClient().admin.attributes.list(ctx.store.id, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni STORE attribute tanimi olusturur. Govde dogrulamasi gateway Zod kontratina birakilir. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: AttributeDefinitionCreateRequest;
  try {
    body = (await request.json()) as AttributeDefinitionCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.attributes.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
