import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
  unauthorizedResponse,
} from "../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-178 (Faz E) — Platform Admin attachment upload proxy'si (multipart). Visibility query param
 * (STORE_VISIBLE | INTERNAL); gateway server-validate. token httpOnly cookie'den; CSRF köprülenir.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return unauthorizedResponse();
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const { id } = await params;
  const visibility =
    new URL(request.url).searchParams.get("visibility") === "INTERNAL" ? "INTERNAL" : "STORE_VISIBLE";

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
    const result = await createApiClient().platformRequests.platform.uploadAttachment(
      id,
      visibility,
      outgoing,
      token,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
