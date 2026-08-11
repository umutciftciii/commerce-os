import { NextResponse, type NextRequest } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

// Store'un izinli lifecycle aksiyonları (assign/priority/recategorize gibi PLATFORM aksiyonları YOK).
type StoreRequestAction = "withdraw" | "confirmClose" | "reopen";
interface ActionBody {
  action: StoreRequestAction;
  expectedVersion: number;
}

/**
 * TODO-178 (Faz D) — Sürüm-korumalı store aksiyonları (withdraw / confirm-close / reopen). Her biri
 * optimistic `expectedVersion` taşır; gateway lifecycle guard'ları (CANNOT_WITHDRAW / REOPEN_WINDOW_EXPIRED
 * vb.) ve VERSION_CONFLICT'i döner. storeId server-context'ten; cross-store id → 404.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id } = await params;
  let body: ActionBody;
  try {
    body = (await request.json()) as ActionBody;
  } catch {
    return badRequestResponse();
  }
  if (typeof body.expectedVersion !== "number") return badRequestResponse();
  const store = createApiClient().platformRequests.store;
  const input = { expectedVersion: body.expectedVersion };
  try {
    switch (body.action) {
      case "withdraw":
        return NextResponse.json(await store.withdraw(ctx.store.id, id, input, ctx.token));
      case "confirmClose":
        return NextResponse.json(await store.confirmClose(ctx.store.id, id, input, ctx.token));
      case "reopen":
        return NextResponse.json(await store.reopen(ctx.store.id, id, input, ctx.token));
      default:
        return badRequestResponse();
    }
  } catch (error) {
    return errorResponse(error);
  }
}
