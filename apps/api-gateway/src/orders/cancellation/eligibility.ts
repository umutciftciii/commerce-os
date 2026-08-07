import type { OrderStatus, ShipmentDirection, ShipmentStatus } from "@prisma/client";
import type { CancellationEligibilityState } from "@commerce-os/contracts";

/**
 * TODO-174 (ADR-275) — Self-servis iptal uygunluğu SAF hesabı (server-authoritative; müşteri KARAR VERMEZ).
 *
 * Gerçek sınır `Shipment var mı?` DEĞİL, CARRIER HANDOFF'tur. Yalnız OUTBOUND_TO_CUSTOMER gönderiler
 * sayılır; reverse yönler (CUSTOMER_RETURN_TO_STORE / STORE_RETURN_TO_CUSTOMER) HESABA GİRMEZ.
 *
 * Uygunluk (öncelik sırasıyla):
 *   1. Sipariş durumu PLACED/CONFIRMED değilse → NOT_CANCELLABLE (DRAFT müşteri-görünür değil; CANCELLED/FULFILLED terminal).
 *   2. Herhangi bir OUTBOUND gönderi DELIVERED → BLOCKED_DELIVERED (→ mevcut Return Flow; iptal değil).
 *   3. Herhangi bir OUTBOUND gönderi carrier'a devredilmiş (IN_TRANSIT/OUT_FOR_DELIVERY/DELIVERY_FAILED/RETURNED)
 *      → BLOCKED_IN_TRANSIT ("kargoya verildi" mesajı; MVP'de tüm sipariş için self-servis iptal kapalı).
 *   4. Aksi halde (gönderi yok VEYA yalnız DRAFT/ORDER_CREATED/LABEL_PENDING/LABEL_CREATED/CANCELLED/FAILED) → ALLOWED.
 *
 * DELIVERED, diğer handed-off durumlardan ÖNCE değerlendirilir: karışık gönderide teslim varsa müşteri
 * iade akışına yönlendirilir (daha doğru CTA).
 */

/** Carrier handoff gerçekleşmiş (self-servis iptali bloklayan) OUTBOUND gönderi durumları. */
export const CARRIER_HANDED_OFF_STATUSES: readonly ShipmentStatus[] = [
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "DELIVERY_FAILED",
  "RETURNED",
] as const;

/** Sipariş bu durumdayken self-servis iptal düşünülebilir (aksi → NOT_CANCELLABLE). */
export const CANCELLABLE_ORDER_STATUSES: readonly OrderStatus[] = ["PLACED", "CONFIRMED"] as const;

export interface CancellationShipmentInput {
  direction: ShipmentDirection;
  status: ShipmentStatus;
}

export interface CancellationEligibilityInput {
  orderStatus: OrderStatus;
  /** Siparişin TÜM gönderileri (fonksiyon OUTBOUND_TO_CUSTOMER'a göre filtreler). */
  shipments: CancellationShipmentInput[];
}

/** Bir OUTBOUND gönderi carrier'a devredilmiş mi (handoff)? */
export function isCarrierHandedOff(status: ShipmentStatus): boolean {
  return CARRIER_HANDED_OFF_STATUSES.includes(status);
}

/** Saf uygunluk durumu (state). estimatedRefund/version DB'den ayrı türetilir; bu fonksiyon YALNIZ state. */
export function computeCancellationEligibility(
  input: CancellationEligibilityInput,
): CancellationEligibilityState {
  if (!CANCELLABLE_ORDER_STATUSES.includes(input.orderStatus)) {
    return "NOT_CANCELLABLE";
  }
  const outbound = input.shipments.filter((s) => s.direction === "OUTBOUND_TO_CUSTOMER");
  if (outbound.some((s) => s.status === "DELIVERED")) {
    return "BLOCKED_DELIVERED";
  }
  if (outbound.some((s) => s.status !== "DELIVERED" && isCarrierHandedOff(s.status))) {
    return "BLOCKED_IN_TRANSIT";
  }
  return "ALLOWED";
}

/** Server-side guard: yalnız ALLOWED iptal edilebilir. */
export function isCancellationAllowed(state: CancellationEligibilityState): boolean {
  return state === "ALLOWED";
}

/** Handoff yapılmamış (iptal sırasında CANCELLED yapılabilecek) OUTBOUND gönderi durumları. */
export function isPreHandoffOutbound(input: CancellationShipmentInput): boolean {
  return input.direction === "OUTBOUND_TO_CUSTOMER" && !isCarrierHandedOff(input.status);
}
