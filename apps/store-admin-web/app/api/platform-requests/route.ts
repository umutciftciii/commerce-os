import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type CreateStorePlatformRequestRequest } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";
import { PLATFORM_REQUEST_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

/**
 * TODO-178 (Faz D) — Store→Platform talep listesi + yeni talep. storeId server-side store-context'ten
 * gelir (client'tan ASLA); INTERNAL içerik store DTO'suna gateway serializer'ında zaten girmez.
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const query = pickListQuery(request.nextUrl.searchParams, PLATFORM_REQUEST_LIST_KEYS);
  try {
    return NextResponse.json(
      await createApiClient().platformRequests.store.list(ctx.store.id, query, ctx.token),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

/** Yeni platform talebi oluşturur; gateway detail DTO döner (PR numarası dahil). Priority store'ca seçilemez. */
export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  let body: CreateStorePlatformRequestRequest;
  try {
    body = (await request.json()) as CreateStorePlatformRequestRequest;
  } catch {
    return badRequestResponse();
  }
  try {
    return NextResponse.json(
      await createApiClient().platformRequests.store.create(ctx.store.id, body, ctx.token),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
