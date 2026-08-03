import type { ShipmentStatus } from "@prisma/client";

/**
 * TODO-169 (ADR-269 §2) — İade uygunluğu SAF hesabı (server-authoritative; müşteri KARAR VERMEZ).
 *
 * Bir kalem iade edilebilir ⇔ tümü sağlanır:
 *  1. Siparişin EN AZ BİR teslim edilmiş (DELIVERED) gönderisi var (order-level "teslim").
 *  2. Pencere içinde: now ≤ deliveredAt + returnWindowDays.
 *  3. remainingReturnableQty > 0 (satın alınan − tutulan iade adedi).
 *  4. Ürün/tür iade-dışı değil (ilk faz: exclusion registry yok → bu eksende her zaman uygun).
 *
 * Teslim ankoru: siparişin teslim edilmiş gönderileri üzerinden MAX(deliveredAt); deliveredAt
 * null (legacy) ise o gönderinin updatedAt'i. Çoklu gönderide EN GEÇ teslim, müşteri-lehine seçim.
 */

export interface ShipmentEligibilityInput {
  status: ShipmentStatus;
  deliveredAt: Date | null;
  updatedAt: Date;
}

/**
 * Siparişin teslim ankoru: teslim edilmiş gönderiler arasından en geç deliveredAt (null ise
 * updatedAt fallback). Teslim edilmiş gönderi yoksa null (henüz iade edilemez).
 */
export function resolveDeliveryAnchor(shipments: ShipmentEligibilityInput[]): Date | null {
  let anchor: Date | null = null;
  for (const s of shipments) {
    if (s.status !== "DELIVERED") continue;
    const at = s.deliveredAt ?? s.updatedAt;
    if (anchor === null || at.getTime() > anchor.getTime()) {
      anchor = at;
    }
  }
  return anchor;
}

/** Siparişte iade akışı başlatılabilir mi (≥1 teslim edilmiş gönderi)? */
export function isOrderReturnable(shipments: ShipmentEligibilityInput[]): boolean {
  return resolveDeliveryAnchor(shipments) !== null;
}

/** returnWindowDays gün sonrası pencere bitişi (anchor + gün). anchor null ise null. */
export function computeReturnWindowEnd(anchor: Date | null, returnWindowDays: number): Date | null {
  if (anchor === null) return null;
  return new Date(anchor.getTime() + returnWindowDays * 24 * 60 * 60 * 1000);
}

export type LineEligibilityStatus =
  | "ELIGIBLE"
  | "NOT_DELIVERED"
  | "WINDOW_EXPIRED"
  | "FULLY_RETURNED"
  | "NOT_ELIGIBLE";

export interface LineEligibilityInput {
  orderLineQuantity: number;
  /** Bu satır için TUTULAN iade adedi (açık + kabul edilmiş; red/iptal/expire DÜŞÜLMÜŞ). */
  heldReturnedQty: number;
  deliveryAnchor: Date | null;
  returnWindowDays: number;
  now: Date;
  /** Ürün/tür iade-dışı mı (ilk faz: her zaman false; gelecekteki exclusion registry uzantısı). */
  excluded?: boolean;
}

export interface LineEligibilityResult {
  status: LineEligibilityStatus;
  remainingReturnableQty: number;
  returnWindowEndsAt: Date | null;
}

/**
 * Tek satır uygunluğu (kalan adet + pencere durumu). remainingReturnableQty asla negatif olmaz.
 * Durum önceliği: exclusion → teslim → pencere → kalan adet → uygun.
 */
export function computeLineEligibility(input: LineEligibilityInput): LineEligibilityResult {
  const remaining = Math.max(0, input.orderLineQuantity - input.heldReturnedQty);
  const windowEnd = computeReturnWindowEnd(input.deliveryAnchor, input.returnWindowDays);

  if (input.excluded) {
    return { status: "NOT_ELIGIBLE", remainingReturnableQty: remaining, returnWindowEndsAt: windowEnd };
  }
  if (input.deliveryAnchor === null || windowEnd === null) {
    return { status: "NOT_DELIVERED", remainingReturnableQty: remaining, returnWindowEndsAt: null };
  }
  if (input.now.getTime() > windowEnd.getTime()) {
    return { status: "WINDOW_EXPIRED", remainingReturnableQty: remaining, returnWindowEndsAt: windowEnd };
  }
  if (remaining <= 0) {
    return { status: "FULLY_RETURNED", remainingReturnableQty: 0, returnWindowEndsAt: windowEnd };
  }
  return { status: "ELIGIBLE", remainingReturnableQty: remaining, returnWindowEndsAt: windowEnd };
}

/** Sadece uygun (ELIGIBLE) satır bir talebe eklenebilir; server-side guard için yardımcı. */
export function isLineEligible(result: LineEligibilityResult): boolean {
  return result.status === "ELIGIBLE";
}
