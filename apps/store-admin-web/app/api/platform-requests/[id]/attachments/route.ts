import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-178 (Faz E) — Store attachment upload proxy'si (multipart). Visibility gateway'de DAİMA
 * STORE_VISIBLE'a zorlanır (client gönderemez); storageKey server-side. storeId server-context'ten.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return badRequestResponse();
  }
  const file = incoming.get("file");
  if (!(file instanceof File)) return badRequestResponse();

  const outgoing = new FormData();
  outgoing.append("file", file, file.name);
  try {
    const result = await createApiClient().platformRequests.store.uploadAttachment(
      ctx.store.id,
      id,
      outgoing,
      ctx.token,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
