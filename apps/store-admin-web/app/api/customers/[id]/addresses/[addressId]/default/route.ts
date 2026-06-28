import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; addressId: string }>;

/** Adresi varsayılan teslimat+fatura adresi yapar (CSRF zorunlu). */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, addressId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.customers.addresses.setDefault(
        ctx.store.id,
        id,
        addressId,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
