import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CustomerCommunicationPreference } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Müşteri iletişim tercihlerini günceller (CSRF zorunlu). */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: CustomerCommunicationPreference;
  try {
    body = (await request.json()) as CustomerCommunicationPreference;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.customers.updateCommunicationPreferences(
        ctx.store.id,
        id,
        body,
        ctx.token,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
