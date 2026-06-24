import type { Order } from "@commerce-os/api-client";

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
