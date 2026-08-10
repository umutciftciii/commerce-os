/**
 * TODO-177 (ADR-289) Faz D — Vitrin Ürün Desteği okuma/yazma veri katmanı (sunucu-yalnız).
 *
 * `lib/server/returns.ts` desenini birebir izler: gateway'in müşteri destek uçlarını
 * `x-customer-session` httpOnly cookie jetonuyla çağırır (bkz. gateway.ts); jeton client
 * bundle'a girmez, loglanmaz. UYGUNLUK/GRAPH/SLA/REOPEN penceresi SUNUCU-OTORİTERDİR — bu
 * modül yalnız çağırır ve tipli sonucu döner; hiçbir traversal/warranty/SLA matematiği
 * yapmaz (client wizard sadece resolve yanıtındaki grafı AYNALAR). Mutasyonların Server
 * Action sarmalayıcıları `lib/server/support-actions.ts` içindedir.
 */
import type {
  CustomerSupportTicketDetail,
  CustomerSupportTicketListItem,
  SupportMessageCreateRequest,
  SupportResolveRequest,
  SupportResolveResponse,
  SupportTicketCreateRequest,
} from "@commerce-os/contracts";
import { customerBasePath } from "./customer";
import { gatewayBaseUrl, getCustomer, sendCustomer, type FetchOutcome } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

/** Destek uçları taban yolu (müşteri base path + /support). */
function supportBasePath(): string {
  return `${customerBasePath()}/support`;
}

/**
 * Guided bağlam çözümü (topic seçildikten sonra). Yanıt: published question graph +
 * order-line context + warranty uygunluğu. orderLineId+storeId+customerId GATEWAY'de
 * yeniden doğrulanır (client-provided metadata güvenilmez). Hata zarfı döner; wizard
 * kodu anlamlı müşteri mesajına eşler (ORDER_LINE_NOT_FOUND / QUESTION_SET_UNAVAILABLE).
 */
export async function resolveSupport(
  body: SupportResolveRequest,
): Promise<FetchOutcome<SupportResolveResponse>> {
  const token = await readCustomerToken();
  return sendCustomer<SupportResolveResponse>("POST", `${supportBasePath()}/resolve`, token, body);
}

/** Müşterinin destek talepleri (yalnız kendi). Oturum yok/hata → boş liste. */
export async function listSupportTickets(): Promise<CustomerSupportTicketListItem[]> {
  const token = await readCustomerToken();
  if (!token) return [];
  const result = await getCustomer<{ tickets: CustomerSupportTicketListItem[] }>(
    `${supportBasePath()}/tickets`,
    token,
  );
  return result.ok ? result.data.tickets : [];
}

/** Tek destek talebi detayı (yalnız kendi). Başka müşteri/yok → null → çağıran notFound(). */
export async function getSupportTicket(
  ticketNumber: string,
): Promise<CustomerSupportTicketDetail | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  const result = await getCustomer<{ ticket: CustomerSupportTicketDetail }>(
    `${supportBasePath()}/tickets/${encodeURIComponent(ticketNumber)}`,
    token,
  );
  if (result.ok) return result.data.ticket;
  if (result.status === 404 || result.status === 401 || result.status === 403) return null;
  throw new Error(`Destek talebi alınamadı (${ticketNumber}): gateway ${result.status}`);
}

/** Destek talebi oluştur (201 → { ticket }). Hata zarfı ({ ok:false, status, code }) döner. */
export async function createSupportTicket(
  body: SupportTicketCreateRequest,
): Promise<FetchOutcome<{ ticket: CustomerSupportTicketDetail }>> {
  const token = await readCustomerToken();
  return sendCustomer<{ ticket: CustomerSupportTicketDetail }>(
    "POST",
    `${supportBasePath()}/tickets`,
    token,
    body,
  );
}

/** Müşteri yanıtı gönder (server ticket'ı WAITING_STORE'a taşır; kapalıysa reddeder). */
export async function sendSupportMessage(
  ticketNumber: string,
  body: SupportMessageCreateRequest,
): Promise<FetchOutcome<{ ticket: CustomerSupportTicketDetail }>> {
  const token = await readCustomerToken();
  return sendCustomer<{ ticket: CustomerSupportTicketDetail }>(
    "POST",
    `${supportBasePath()}/tickets/${encodeURIComponent(ticketNumber)}/messages`,
    token,
    body,
  );
}

/**
 * RESOLVED talebi yeniden aç (yalnız owner + 7 gün içinde; taze SLA döngüsü sunucuda
 * oluşur). Body YOK — sunucu owner/pencere/durum kararını kendi verir.
 */
export async function reopenSupportTicket(
  ticketNumber: string,
): Promise<FetchOutcome<{ ticket: CustomerSupportTicketDetail }>> {
  const token = await readCustomerToken();
  return sendCustomer<{ ticket: CustomerSupportTicketDetail }>(
    "POST",
    `${supportBasePath()}/tickets/${encodeURIComponent(ticketNumber)}/reopen`,
    token,
  );
}

/**
 * Destek eki yükle (multipart; PHOTO/PDF). Gateway görseli sharp/webp'e normalize eder,
 * PDF'i olduğu gibi saklar ve yalnız `{ mediaId }` döner — ek PRIVATE'tır (auth-gate'li
 * serve). `content-type` header'ı ELLE ayarlanmaz; FormData boundary'yi runtime belirler.
 */
export async function uploadSupportAttachment(
  file: File,
): Promise<FetchOutcome<{ mediaId: string }>> {
  const token = await readCustomerToken();
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${gatewayBaseUrl()}${supportBasePath()}/attachments`, {
    method: "POST",
    headers: token ? { "x-customer-session": token } : {},
    body: form,
    cache: "no-store",
  });
  if (!response.ok) {
    let code: string | null = null;
    try {
      const parsed: unknown = await response.json();
      if (
        parsed &&
        typeof parsed === "object" &&
        "error" in parsed &&
        parsed.error &&
        typeof parsed.error === "object" &&
        "code" in parsed.error &&
        typeof (parsed.error as { code: unknown }).code === "string"
      ) {
        code = (parsed.error as { code: string }).code;
      }
    } catch {
      // Gövde JSON değilse status tabanlı devam.
    }
    return { ok: false, status: response.status, code };
  }
  return { ok: true, data: (await response.json()) as { mediaId: string } };
}
