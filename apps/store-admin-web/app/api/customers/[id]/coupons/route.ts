import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** F4A.3 — Bir musterinin kupon cuzdani (atanmis/claim/kullanilmis). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.customerCoupons.list(ctx.store.id, id, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** F4A.3 — Bu musteriye bir kupon atar (body: { couponId }). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: { couponId?: string };
  try {
    body = (await request.json()) as { couponId?: string };
  } catch {
    return badRequestResponse();
  }
  if (!body.couponId) return badRequestResponse();
  try {
    return NextResponse.json(
      await createApiClient().admin.customerCoupons.assign(ctx.store.id, id, body.couponId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
