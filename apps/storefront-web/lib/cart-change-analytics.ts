/**
 * TODO-168 (ADR-267) — Cart Change Awareness client analytics (best-effort, KVKK, no PII).
 *
 * BFF proxy'ye (`/api/cart/change-event`) fetch/keepalive ile emit eder; gateway KVKK-hash'ler +
 * `(storeId, dedupeKey)` idempotent. Hata YUTULUR (UX'i etkilemez). Ham cart id/fingerprint dışında
 * teknik detay taşınmaz; cartId gateway'de hash'lenir.
 */
export type CartChangeAnalyticsEventType =
  | "detected"
  | "viewed"
  | "acknowledged"
  | "checkout_blocked"
  | "item_removed";

export interface CartChangeAnalyticsPayload {
  cartId: string;
  changeType: string;
  eventType: CartChangeAnalyticsEventType;
  fingerprint: string;
  severity?: string;
  variantId?: string;
  oldMinor?: number | null;
  newMinor?: number | null;
  currency?: string | null;
  placement?: "CART_BAR" | "CART_LINE" | "CHECKOUT";
}

export function emitCartChangeEvent(payload: CartChangeAnalyticsPayload): void {
  if (!payload.cartId || !payload.fingerprint) return;
  try {
    void fetch("/api/cart/change-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
      cache: "no-store",
    }).catch(() => {});
  } catch {
    // best-effort: ölçüm hatası UX'i etkilemez.
  }
}
