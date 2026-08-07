/**
 * TODO-169 (ADR-269) — Vitrin müşteri İADE okuma/yazma veri katmanı (sunucu-yalnız).
 *
 * `lib/server/customer.ts` desenini birebir izler: gateway'in müşteri iade uçlarını
 * `x-customer-session` httpOnly cookie jetonuyla çağırır (bkz. gateway.ts); jeton
 * client bundle'a girmez, loglanmaz. UYGUNLUK/İADE TUTARI SUNUCU-OTORİTERDİR — bu
 * modül yalnız çağırır ve tipli sonucu döner; hiçbir eligibility/refund matematiği
 * yapmaz (ADR-269 §2/§6). Mutasyonların Server Action sarmalayıcıları
 * `lib/server/return-actions.ts` içindedir.
 */
import type {
  CustomerReturnCreateRequest,
  CustomerReturnDetail,
  CustomerReturnEligibility,
  CustomerRefundVisibilityItem,
  CustomerReturnTrackingRequest,
} from "@commerce-os/contracts";
import { customerBasePath } from "./customer";
import { gatewayBaseUrl, getCustomer, sendCustomer, type FetchOutcome } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

/** İade uçları taban yolu (müşteri base path + /returns). */
function returnsBasePath(): string {
  return `${customerBasePath()}/returns`;
}

/**
 * Sipariş bazlı iade uygunluğu (sunucu-otoriter). Oturum yok / başka müşterinin
 * siparişi / bulunamadı → null (varlık sızıntısı yok, çağıran boş durum gösterir).
 */
export async function getReturnEligibility(
  orderNumber: string,
): Promise<CustomerReturnEligibility | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  const result = await getCustomer<{ eligibility: CustomerReturnEligibility }>(
    `${customerBasePath()}/orders/${encodeURIComponent(orderNumber)}/return-eligibility`,
    token,
  );
  return result.ok ? result.data.eligibility : null;
}

/**
 * Müşterinin BİRLEŞİK "İadelerim" listesi (yalnız kendi): iade talepleri + sipariş iptali geri
 * ödemeleri (TODO-174A). Her satır `source` ile etiketli. Oturum yok/hata → boş liste.
 */
export async function listReturns(): Promise<CustomerRefundVisibilityItem[]> {
  const token = await readCustomerToken();
  if (!token) return [];
  const result = await getCustomer<{ data: CustomerRefundVisibilityItem[] }>(
    returnsBasePath(),
    token,
  );
  return result.ok ? result.data.data : [];
}

/** Tek iade detayı (yalnız kendi). Başka müşteri/yok → null → çağıran notFound(). */
export async function getReturnDetail(
  returnNumber: string,
): Promise<CustomerReturnDetail | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  const result = await getCustomer<{ return: CustomerReturnDetail }>(
    `${returnsBasePath()}/${encodeURIComponent(returnNumber)}`,
    token,
  );
  return result.ok ? result.data.return : null;
}

/** İade talebi oluştur (201 → { return }). Hata zarfı ({ ok:false, status, code }) döner. */
export async function createReturn(
  body: CustomerReturnCreateRequest,
): Promise<FetchOutcome<{ return: CustomerReturnDetail }>> {
  const token = await readCustomerToken();
  return sendCustomer<{ return: CustomerReturnDetail }>("POST", returnsBasePath(), token, body);
}

/** İade kargo takip no gönder (AWAITING_SHIPMENT → RETURN_SHIPPED). */
export async function submitReturnTracking(
  returnNumber: string,
  body: CustomerReturnTrackingRequest,
): Promise<FetchOutcome<{ return: CustomerReturnDetail }>> {
  const token = await readCustomerToken();
  return sendCustomer<{ return: CustomerReturnDetail }>(
    "POST",
    `${returnsBasePath()}/${encodeURIComponent(returnNumber)}/tracking`,
    token,
    body,
  );
}

/** İade talebini iptal et (yalnız onay öncesi; server state-machine karar verir). */
export async function cancelReturn(
  returnNumber: string,
): Promise<FetchOutcome<{ return: CustomerReturnDetail }>> {
  const token = await readCustomerToken();
  return sendCustomer<{ return: CustomerReturnDetail }>(
    "POST",
    `${returnsBasePath()}/${encodeURIComponent(returnNumber)}/cancel`,
    token,
  );
}

/**
 * İade fotoğrafı yükle (multipart). Gateway sharp/webp pipeline'ından geçirir ve
 * yalnız `{ mediaId }` döner — attachment PRIVATE'tır (ADR-269 §8), geri fetch YOK.
 * `content-type` header'ı ELLE ayarlanmaz; FormData boundary'yi runtime belirler.
 */
export async function uploadReturnAttachment(
  file: File,
): Promise<FetchOutcome<{ mediaId: string }>> {
  const token = await readCustomerToken();
  const form = new FormData();
  form.append("file", file);
  const response = await fetch(`${gatewayBaseUrl()}${returnsBasePath()}/attachments`, {
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
