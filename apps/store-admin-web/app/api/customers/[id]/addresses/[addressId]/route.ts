import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CustomerAddressInput } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; addressId: string }>;

/** Müşteri adresini günceller (CSRF zorunlu). */
export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, addressId } = await params;
  let body: CustomerAddressInput;
  try {
    body = (await request.json()) as CustomerAddressInput;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.customers.addresses.update(
        ctx.store.id,
        id,
        addressId,
        body,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Müşteri adresini soft-delete eder (CSRF zorunlu). */
export async function DELETE(request: NextRequest, { params }: { params: Params }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, addressId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.customers.addresses.remove(ctx.store.id, id, addressId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
