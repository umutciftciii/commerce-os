/**
 * TODO-174 (ADR-275/277/278) — Vitrin müşteri İPTAL okuma/yazma veri katmanı (sunucu-yalnız).
 *
 * `lib/server/returns.ts` desenini birebir izler: gateway'in müşteri iptal uçlarını
 * `x-customer-session` httpOnly cookie jetonuyla çağırır (bkz. gateway.ts); jeton client
 * bundle'a girmez, loglanmaz. UYGUNLUK/İADE TUTARI SUNUCU-OTORİTERDİR — bu modül yalnız
 * çağırır ve tipli sonucu döner; hiçbir eligibility/refund matematiği yapmaz (ADR-278).
 * İstemci YALNIZ reasonCode/reasonNote/expectedVersion gönderir (refund tutarı YOK).
 * Mutasyonun Server Action sarmalayıcısı `lib/server/cancellation-actions.ts` içindedir.
 */
import type {
  CancellationOrderSummary,
  CustomerOrderCancelRequest,
  CustomerOrderCancelResponse,
} from "@commerce-os/contracts";
import { customerBasePath } from "./customer";
import { getCustomer, sendCustomer, type FetchOutcome } from "./gateway";
import { readCustomerToken } from "./customer-cookie";

/**
 * Sipariş bazlı iptal uygunluğu (sunucu-otoriter). Oturum yok / başka müşterinin
 * siparişi / bulunamadı / projeksiyon fail-open → null (varlık sızıntısı yok, çağıran
 * "iptal edilemez" olarak ele alır).
 */
export async function getCancelEligibility(
  orderNumber: string,
): Promise<CancellationOrderSummary | null> {
  const token = await readCustomerToken();
  if (!token) return null;
  const result = await getCustomer<{ eligibility: CancellationOrderSummary | null }>(
    `${customerBasePath()}/orders/${encodeURIComponent(orderNumber)}/cancel-eligibility`,
    token,
  );
  return result.ok ? result.data.eligibility : null;
}

/** Sipariş iptal talebi (POST → { order, cancellation }). Hata zarfı ({ ok:false, status, code }) döner. */
export async function cancelOrder(
  orderNumber: string,
  body: CustomerOrderCancelRequest,
): Promise<FetchOutcome<CustomerOrderCancelResponse>> {
  const token = await readCustomerToken();
  return sendCustomer<CustomerOrderCancelResponse>(
    "POST",
    `${customerBasePath()}/orders/${encodeURIComponent(orderNumber)}/cancel`,
    token,
    body,
  );
}
