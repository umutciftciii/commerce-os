import { type NextRequest } from "next/server";
import { resolveApiGatewayUrl } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../lib/server/store-context";

export const dynamic = "force-dynamic";

/**
 * TODO-178 (Faz E) — Store attachment auth-gate'li serve proxy'si. Gateway YALNIZ STORE_VISIBLE +
 * storeId-scoped ek döner; INTERNAL / cross-store (id bilinse bile) → 404 (sadık yansıtılır). Ham
 * storageKey/mimeType kaynağı client'a taşınmaz; yanıt `private, no-store` (public media leak yok).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { attachmentId } = await params;
  const url = `${resolveApiGatewayUrl()}/stores/${ctx.store.id}/platform-requests/attachments/${encodeURIComponent(attachmentId)}`;
  const upstream = await fetch(url, {
    headers: { authorization: `Bearer ${ctx.token}` },
    cache: "no-store",
  });
  if (!upstream.ok) return new Response(null, { status: upstream.status });
  const body = await upstream.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": upstream.headers.get("content-type") ?? "application/octet-stream",
      "cache-control": "private, no-store",
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
    },
  });
}
