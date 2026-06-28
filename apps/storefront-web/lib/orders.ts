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

/** İade penceresi (gün). Gerçek iade akışı sonraki fazda (F3K/F3C). */
export const RETURN_WINDOW_DAYS = 15;

/** İki tarih arası tam gün farkı (negatif olmaz). */
export function daysSince(createdAtIso: string, now: Date = new Date()): number {
  const created = new Date(createdAtIso).getTime();
  if (Number.isNaN(created)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - created) / (1000 * 60 * 60 * 24));
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
 * İade talebi CTA görünürlüğü (placeholder akış). Görünür koşulu: sipariş
 * FULFILLED/PARTIAL (gönderilmiş) + iptal/iade değil. `windowExpired` 15 günlük
 * pencere dolduğunda true olur → CTA "İade süresi doldu" notuyla pasifleşir.
 */
export interface ReturnEligibility {
  visible: boolean;
  windowExpired: boolean;
}

export function returnEligibility(
  order: Pick<CustomerOrderSummary, "status" | "paymentStatus" | "fulfillmentStatus" | "createdAt">,
  now: Date = new Date(),
): ReturnEligibility {
  const closed = order.status === "CANCELLED" || order.paymentStatus === "REFUNDED";
  const shipped =
    order.fulfillmentStatus === "FULFILLED" || order.fulfillmentStatus === "PARTIAL";
  if (closed || !shipped) {
    return { visible: false, windowExpired: false };
  }
  return { visible: true, windowExpired: daysSince(order.createdAt, now) > RETURN_WINDOW_DAYS };
}

/** Ürün yorumu CTA: yalnız teslim/tamamlanmış (FULFILLED) siparişte aktif. */
export function canWriteReview(
  order: Pick<CustomerOrderSummary, "fulfillmentStatus">,
): boolean {
  return order.fulfillmentStatus === "FULFILLED";
}
