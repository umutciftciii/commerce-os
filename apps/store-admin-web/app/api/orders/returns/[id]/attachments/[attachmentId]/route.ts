import { type NextRequest, NextResponse } from "next/server";
import { createApiClient } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../../lib/server/store-context";
import { errorResponse } from "../../../../../../../lib/server/respond";

export const dynamic = "force-dynamic";

/**
 * TODO-169 (ADR-269 §8) — İade fotoğraf eklerinin AUTH-GATE'li stream'i. Public /media
 * DEĞİL: gateway `/stores/:storeId/returns/:id/attachments/:attId` ucundan (store-admin
 * token'ı ile) baytları çeker ve aynı-origin olarak yansıtır. Böylece <img src> tarayıcıda
 * kimlik doğrulaması olmadan çalışır; erişim server-side session ile korunur.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { id, attachmentId } = await params;
  const client = createApiClient();
  const url = `${client.baseUrl}/stores/${ctx.store.id}/returns/${encodeURIComponent(
    id,
  )}/attachments/${encodeURIComponent(attachmentId)}`;
  try {
    const upstream = await fetch(url, {
      headers: { authorization: `Bearer ${ctx.token}` },
      cache: "no-store",
    });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json(
        { error: { code: "ATTACHMENT_NOT_FOUND", message: "Ek bulunamadı." } },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }
    const headers = new Headers();
    const contentType = upstream.headers.get("content-type");
    if (contentType) headers.set("content-type", contentType);
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("content-length", contentLength);
    // Özel içerik: ara katman/CDN önbelleğe almasın (yetki her istekte yeniden kontrol edilir).
    headers.set("cache-control", "private, no-store");
    return new NextResponse(upstream.body, { status: 200, headers });
  } catch (error) {
    return errorResponse(error);
  }
}
