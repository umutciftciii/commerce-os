import { NextResponse, type NextRequest } from "next/server";
import { createApiClient, type MediaContext } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../lib/server/store-context";
import { isValidCsrfRequest } from "../../../lib/server/csrf";
import { badRequestResponse, csrfForbiddenResponse, errorResponse } from "../../../lib/server/respond";
import { MEDIA_LIST_KEYS, pickListQuery } from "../../../lib/server/list-query";

export const dynamic = "force-dynamic";

const MEDIA_CONTEXTS: readonly MediaContext[] = ["PRODUCT", "CATEGORY", "HERO", "BRANDING"];

/**
 * ADR-065 Faz 2 (Dilim 1) — Media kutuphanesi.
 *
 * GET: secili mağazanin yuklenmis gorsellerini proxy'ler. Salt-okuma; diger GET
 *      route'lari gibi CSRF gerektirmez.
 *      TODO-159B (ADR-090) — TD-095 kapanisi: sabit 100 tavani kalkti; query
 *      allowlist ile page/pageSize/search/sortBy/sortOrder/ids tasinir. `context`
 *      BFF'te de dogrulanir (erken 400; nihai otorite yine gateway).
 * POST: multipart yukleme. Tarayicidan gelen FormData'yi (file + context + altText)
 *       gateway'e yeniden kurar; text field'lar dosyadan ONCE append edilir
 *       (gateway `request.file()` streaming sirasi kurali — bkz. media/routes.ts).
 */
export async function GET(request: NextRequest) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;

  const raw = request.nextUrl.searchParams.get("context");
  if (raw !== null && !(MEDIA_CONTEXTS as readonly string[]).includes(raw)) {
    return badRequestResponse();
  }

  const query = pickListQuery(request.nextUrl.searchParams, MEDIA_LIST_KEYS);
  try {
    return NextResponse.json(await createApiClient().admin.media.list(ctx.store.id, query, ctx.token));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!isValidCsrfRequest(request)) return csrfForbiddenResponse();
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;

  let incoming: FormData;
  try {
    incoming = await request.formData();
  } catch {
    return badRequestResponse();
  }

  const file = incoming.get("file");
  const context = incoming.get("context");
  if (!(file instanceof File) || typeof context !== "string") {
    return badRequestResponse();
  }
  const altText = incoming.get("altText");

  // Gateway field-sirasi kurali: context/altText dosyadan ONCE.
  const outgoing = new FormData();
  outgoing.append("context", context);
  if (typeof altText === "string" && altText.length > 0) outgoing.append("altText", altText);
  outgoing.append("file", file, file.name);

  try {
    const result = await createApiClient().admin.media.upload(ctx.store.id, outgoing, ctx.token);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
