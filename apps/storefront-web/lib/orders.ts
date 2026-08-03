import type { CustomerOrderSummary } from "@commerce-os/api-client";

/**
 * TODO-079 — Hesabım > Siparişlerim saf yardımcıları (sunucu+istemci ortak).
 *
 * Arama/sekme filtreleme ve post-order CTA koşulları burada SAF fonksiyonlar
 * olarak tutulur (yan etkisiz, deterministik → birim test edilebilir). Veri
 * gateway'de zaten store+customer scoped (yalnız kendi siparişleri) döner;
 * burada yalnız müşteri-facing sunum/filtre mantığı vardır. Gerçek iade/yorum
 * lifecycle YOK — yalnız UI görünürlük kuralları (placeholder akışlar).
 */

export type OrdersTab = "all" | "buy-again" | "not-shipped";

export const ORDERS_TABS: readonly OrdersTab[] = ["all", "buy-again", "not-shipped"];

export function resolveOrdersTab(value: string | undefined): OrdersTab {
  return value && (ORDERS_TABS as readonly string[]).includes(value)
    ? (value as OrdersTab)
    : "all";
}

/** "Tekrar satın al" sekmesi/CTA uygunluğu: iptal/taslak değilse. */
export function isReorderable(order: Pick<CustomerOrderSummary, "status">): boolean {
  return order.status !== "CANCELLED" && order.status !== "DRAFT";
}

/** "Henüz kargoya verilmedi" sekmesi: iptal değil + gönderilmemiş/hazırlanıyor. */
export function isNotShipped(
  order: Pick<CustomerOrderSummary, "status" | "fulfillmentStatus">,
): boolean {
  return (
    order.status !== "CANCELLED" &&
    (order.fulfillmentStatus === "UNFULFILLED" || order.fulfillmentStatus === "PARTIAL")
  );
}

export function filterOrdersByTab(
  orders: CustomerOrderSummary[],
  tab: OrdersTab,
): CustomerOrderSummary[] {
  switch (tab) {
    case "buy-again":
      return orders.filter(isReorderable);
    case "not-shipped":
      return orders.filter(isNotShipped);
    default:
      return orders;
  }
}

/** Sipariş no / ürün adı / varyant / SKU üzerinde TR-duyarsız arama. */
export function searchOrders(
  orders: CustomerOrderSummary[],
  query: string,
): CustomerOrderSummary[] {
  const q = query.trim().toLocaleLowerCase("tr");
  if (!q) return orders;
  return orders.filter((order) => {
    if (order.orderNumber.toLocaleLowerCase("tr").includes(q)) return true;
    return order.lines.some(
      (line) =>
        line.title.toLocaleLowerCase("tr").includes(q) ||
        line.variantTitle.toLocaleLowerCase("tr").includes(q) ||
        line.sku.toLocaleLowerCase("tr").includes(q),
    );
  });
}

export function applyOrderFilters(
  orders: CustomerOrderSummary[],
  options: { tab: OrdersTab; query: string },
): CustomerOrderSummary[] {
  return searchOrders(filterOrdersByTab(orders, options.tab), options.query);
}

/**
 * TODO-169 (ADR-269) — İade CTA'sı yalnız GÖRÜNÜRLÜK kapısıdır; UYGUNLUK KARARI
 * DEĞİLDİR. İstemci 15 günlük pencereyi TAHMİN ETMEZ (eski `windowExpired` guess
 * KALDIRILDI): gerçek uygunluk/pencere/kalan adet sunucudan (`getReturnEligibility`)
 * sihirbaz açılışında gelir. Burada yalnız "iade başlatma bağlantısını göster"
 * kaba koşulu var: gönderilmiş (FULFILLED/PARTIAL) + iptal/iade edilmemiş sipariş.
 */
export function canRequestReturn(
  order: Pick<CustomerOrderSummary, "status" | "paymentStatus" | "fulfillmentStatus">,
): boolean {
  const closed = order.status === "CANCELLED" || order.paymentStatus === "REFUNDED";
  const shipped =
    order.fulfillmentStatus === "FULFILLED" || order.fulfillmentStatus === "PARTIAL";
  return !closed && shipped;
}

/** Ürün yorumu CTA: yalnız teslim/tamamlanmış (FULFILLED) siparişte aktif. */
export function canWriteReview(
  order: Pick<CustomerOrderSummary, "fulfillmentStatus">,
): boolean {
  return order.fulfillmentStatus === "FULFILLED";
}
