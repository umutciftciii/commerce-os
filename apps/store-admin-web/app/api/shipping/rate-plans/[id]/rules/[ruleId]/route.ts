import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type ShippingRateRuleInput } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
} from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, ruleId } = await params;
  let body: Partial<ShippingRateRuleInput>;
  try {
    body = (await request.json()) as Partial<ShippingRateRuleInput>;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingRatePlans.updateRule(ctx.store.id, id, ruleId, body, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; ruleId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, ruleId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.shippingRatePlans.deleteRule(ctx.store.id, id, ruleId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
