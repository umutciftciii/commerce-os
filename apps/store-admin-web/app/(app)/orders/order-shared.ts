import type { Order, OrderFulfillmentDisplay } from "@commerce-os/api-client";

export type Tone = "neutral" | "success" | "warning" | "info" | "danger";
export type OrderStatus = Order["status"];
export type PaymentStatus = Order["paymentStatus"];
export type FulfillmentStatus = Order["fulfillmentStatus"];
export type ReservationStatus = Order["reservations"][number]["status"];

export const ORDER_STATUS_TONES: Record<OrderStatus, Tone> = {
  DRAFT: "neutral",
  PLACED: "info",
  CONFIRMED: "success",
  CANCELLED: "danger",
  FULFILLED: "success",
};

export const PAYMENT_STATUS_TONES: Record<PaymentStatus, Tone> = {
  UNPAID: "warning",
  AUTHORIZED: "info",
  PAID: "success",
  REFUNDED: "neutral",
};

export const FULFILLMENT_STATUS_TONES: Record<FulfillmentStatus, Tone> = {
  UNFULFILLED: "neutral",
  PARTIAL: "warning",
  FULFILLED: "success",
  CANCELLED: "danger",
};

// TODO-135 — Kargo hazırlık durumundan türetilen GÖSTERİM rozeti tonları. Rozet
// metni `getOrderFulfillmentDisplay` sonucuna göre i18n `fulfillmentDisplayLabels`
// üzerinden çözülür (Order.fulfillmentStatus MUTATE EDİLMEZ).
export const FULFILLMENT_DISPLAY_TONES: Record<OrderFulfillmentDisplay, Tone> = {
  NOT_SHIPPED: "neutral",
  AWAITING_PICKUP: "info",
  PACKED: "info",
  IN_TRANSIT: "info",
  OUT_FOR_DELIVERY: "info",
  DELIVERED: "success",
  FULFILLED: "success",
  PARTIAL: "warning",
  CANCELLED: "danger",
};

export const RESERVATION_STATUS_TONES: Record<ReservationStatus, Tone> = {
  ACTIVE: "info",
  RELEASED: "neutral",
  CONSUMED: "success",
};

// Yasam dongusu kurallari (backend nihai otorite; UI yalniz uygun aksiyonu gosterir).
export function canPlace(order: Order): boolean {
  return order.status === "DRAFT";
}
export function canCancel(order: Order): boolean {
  return order.status === "PLACED" || order.status === "CONFIRMED";
}
