import { customerBasePath } from "../../../../../../lib/server/customer";
import { gatewayBaseUrl } from "../../../../../../lib/server/gateway";
import { readCustomerToken } from "../../../../../../lib/server/customer-cookie";

export const dynamic = "force-dynamic";

/**
 * TODO-177 (ADR-289) Faz D — Destek eki auth-gate'li BFF proxy'si (sunucu-yalnız).
 *
 * Gateway serve ucu `x-customer-session` HEADER'ı ister; jeton storefront httpOnly cookie'sinde
 * durur ve doğrudan gateway origin'ine gitmez. Bu proxy jetonu server-side header'a çevirir,
 * içeriği stream eder ve iç depolama detayını (storageKey/mimeType kaynağı) client'a taşımaz.
 * Oturum yoksa 401; gateway 404'ü (başka müşteri/yok) sadık yansıtılır. Yanıt `private, no-store`.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ ticketNumber: string; attachmentId: string }> },
): Promise<Response> {
  const { ticketNumber, attachmentId } = await params;
  const token = await readCustomerToken();
  if (!token) {
    return new Response(null, { status: 401 });
  }
  const url = `${gatewayBaseUrl()}${customerBasePath()}/support/tickets/${encodeURIComponent(ticketNumber)}/attachments/${encodeURIComponent(attachmentId)}`;
  const upstream = await fetch(url, {
    headers: { "x-customer-session": token },
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
