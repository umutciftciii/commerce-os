import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type StoreAdminCustomerCreateRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";
import { buildActivationLink } from "../../../lib/server/activation-link";
import { CUSTOMER_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * Secili mağazanin müşteri dizinini gateway'den proxy'ler. Store bağlami server-side.
 * TODO-159A (ADR-089) — Data Grid query'si allowlist ile taşınır.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, CUSTOMER_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().admin.customers.list(ctx.store.id, ctx.token, query),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Yeni müşteri oluşturur (CSRF zorunlu). createMembership=true ise gateway bir
 * ADMIN_ACTIVATION kurulum jetonu döner; bunu tek seferlik linke çevirip istemciye
 * iletiriz (raw token yalnız link içinde, bir kez gösterilir).
 */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: StoreAdminCustomerCreateRequest;
  try {
    body = (await request.json()) as StoreAdminCustomerCreateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    const result = await createApiClient().admin.customers.create(ctx.store.id, body, ctx.token);
    return NextResponse.json(
      {
        customer: result.customer,
        activation: result.setup ? buildActivationLink(result.setup) : null,
      },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
