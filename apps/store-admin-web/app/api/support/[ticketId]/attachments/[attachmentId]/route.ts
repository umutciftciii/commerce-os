import { type NextRequest } from "next/server";
import { resolveApiGatewayUrl } from "@commerce-os/api-client";
import { requireStoreContext } from "../../../../../../lib/server/store-context";

export const dynamic = "force-dynamic";

/**
 * TODO-177 (ADR-289) — Store admin destek eki auth-gate'li BFF proxy'si. Gateway serve ucu
 * store-admin oturumunu (Bearer) ister; içeriği stream eder. Cross-store/cross-ticket ek → gateway
 * 404 (ATTACHMENT_NOT_FOUND) sadık yansıtılır; iç storageKey/mimeType kaynağı client'a taşınmaz.
 * Yanıt `private, no-store` (public media leak yok).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticketId: string; attachmentId: string }> },
): Promise<Response> {
  const ctx = await requireStoreContext(request);
  if (!ctx.ok) return ctx.response;
  const { ticketId, attachmentId } = await params;
  const url = `${resolveApiGatewayUrl()}/stores/${ctx.store.id}/support/tickets/${encodeURIComponent(ticketId)}/attachments/${encodeURIComponent(attachmentId)}`;
  const upstream = await fetch(url, {
    headers: { authorization: `Bearer ${ctx.token}` },
    cache: "no-store",
  });
  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }
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
