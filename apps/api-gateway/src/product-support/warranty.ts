/**
 * ADR-289 (TODO-177) §7 — Ürün Desteği garanti uygunlugu (SAF modul, deterministik).
 *
 * Anchor onceligi:
 *   1) SHIPMENT_DELIVERED — MAX(Shipment.deliveredAt) (order'in DELIVERED gonderileri; ADR-269 stabil ankor)
 *   2) ORDER_CREATED      — teslim yoksa order.createdAt (konservatif; ASLA bloklamaz)
 * warrantyEndsAt = anchor + warrantyMonths (takvim ayi; ay tasmasi ay-sonuna clamp).
 * warrantyMonths null → gating YOK (anchorSource=NONE, endsAt=null, inWarranty=null) → escalation acik.
 * Suresi dolmus olsa bile ticket acilisi engellenmez; yalniz eligibility/context gosterilir.
 */

export type WarrantyAnchorSource = "SHIPMENT_DELIVERED" | "ORDER_CREATED" | "NONE";

export interface WarrantyInput {
  /** Product.warrantyMonths (variant override cozuldukten sonra). null → gating yok. */
  warrantyMonths: number | null;
  /** MAX(Shipment.deliveredAt) veya null (teslim edilmis gonderi yoksa). */
  deliveredAt: Date | null;
  orderCreatedAt: Date;
  now: Date;
}

export interface WarrantyEligibility {
  warrantyEndsAt: Date | null;
  anchorSource: WarrantyAnchorSource;
  /** now <= endsAt. warrantyMonths null iken null (gating uygulanmaz). */
  inWarranty: boolean | null;
}

/**
 * UTC takvim-ayi ekleme; ay tasmasini hedef ayin son gunune clamp eder
 * (31 Ocak + 1 ay = 28/29 Subat). Pure: girdi Date mutasyona ugramaz.
 */
export function addMonthsUtc(date: Date, months: number): Date {
  const day = date.getUTCDate();
  const d = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + months,
      1,
      date.getUTCHours(),
      date.getUTCMinutes(),
      date.getUTCSeconds(),
      date.getUTCMilliseconds(),
    ),
  );
  const daysInTargetMonth = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, daysInTargetMonth));
  return d;
}

export function computeWarrantyEligibility(input: WarrantyInput): WarrantyEligibility {
  if (input.warrantyMonths == null) {
    return { warrantyEndsAt: null, anchorSource: "NONE", inWarranty: null };
  }
  const anchor = input.deliveredAt ?? input.orderCreatedAt;
  const anchorSource: WarrantyAnchorSource = input.deliveredAt
    ? "SHIPMENT_DELIVERED"
    : "ORDER_CREATED";
  const warrantyEndsAt = addMonthsUtc(anchor, input.warrantyMonths);
  const inWarranty = input.now.getTime() <= warrantyEndsAt.getTime();
  return { warrantyEndsAt, anchorSource, inWarranty };
}
