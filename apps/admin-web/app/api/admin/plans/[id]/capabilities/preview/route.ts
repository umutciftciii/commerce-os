import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import type { PlanCapabilitiesUpdateRequest } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../../../../lib/server/session";
import { isValidCsrfRequest } from "../../../../../../../lib/server/csrf";
import {
  badRequestResponse,
  csrfForbiddenResponse,
  errorResponse,
  unauthorizedResponse,
} from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-163 Faz 3 (TD-154) — Plan capability önizleme (POST). Önerilen durum haritasının etkisini
 * (değişen modüller + dependency + doğrulama hataları + abonelik sayısı) uygulamadan döndürür.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const token = getSessionToken(request);
  if (!token) return unauthorizedResponse();
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const { id } = await params;
  let body: PlanCapabilitiesUpdateRequest;
  try {
    body = (await request.json()) as PlanCapabilitiesUpdateRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(await createApiClient().admin.plans.capabilities.preview(id, body, token));
  } catch (error) {
    return errorResponse(error);
  }
}
