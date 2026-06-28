import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CustomerAddressInput } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Müşteriye yeni adres ekler (CSRF zorunlu). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: CustomerAddressInput;
  try {
    body = (await request.json()) as CustomerAddressInput;
  } catch {
    return badRequestResponse();
  }
  try {
    const created = await createApiClient().admin.customers.addresses.create(
      ctx.store.id,
      id,
      body,
      ctx.token,
    );
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
