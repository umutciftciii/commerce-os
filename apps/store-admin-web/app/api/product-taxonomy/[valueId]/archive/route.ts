import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/** Governed taksonomi degerini arsivler (ACTIVE -> ARCHIVED; bagli option ayni tx'te). */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ valueId: string }> },
) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { valueId } = await params;
  try {
    return NextResponse.json(
      await createApiClient().admin.productTaxonomy.archive(ctx.store.id, valueId, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
