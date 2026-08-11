import { type NextRequest } from "next/server";
import { resolveApiGatewayUrl } from "@commerce-os/api-client";
import { getSessionToken } from "../../../../../../lib/server/session";

export const dynamic = "force-dynamic";

/**
 * TODO-178 (Faz E) — Platform Admin attachment serve proxy'si. Gateway platform serve ucu tam yüzey
 * (STORE_VISIBLE + INTERNAL) döner; Bearer ile stream edilir. Ham storageKey client'a taşınmaz; yanıt
 * `private, no-store` (public media leak yok). Yetkisiz → 401; bulunamayan ek → gateway 404 yansıtılır.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ attachmentId: string }> },
): Promise<Response> {
  const token = getSessionToken(request);
  if (!token) return new Response(null, { status: 401 });
  const { attachmentId } = await params;
  const url = `${resolveApiGatewayUrl()}/platform/requests/attachments/${encodeURIComponent(attachmentId)}`;
  const upstream = await fetch(url, {
    headers: { authorization: `Bearer ${token}` },
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
