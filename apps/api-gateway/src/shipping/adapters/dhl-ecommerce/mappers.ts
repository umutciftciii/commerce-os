import type {
  ShippingAuthResult,
  ShippingBarcodeResult,
  ShippingGeoResult,
  ShippingOrderCreateResult,
  ShippingRateResult,
  ShippingShipmentStatusResult,
  ShippingTrackingEventResult,
} from "../../types.js";

/**
 * F3C.1 — DHL eCommerce yanit eslemecileri (OpenAPI semasina gore).
 *
 * KRITIK: token yaniti SANITIZE edilir — `jwt`/`refreshToken` ASLA result'a/log'a
 * cikmaz; yalnizca varlik + son-kullanim tarihi tasinir. Tum ucret/durum mapper'lari
 * provider-spesifik sayilari ortak normalized modele cevirir.
 */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Token yaniti → SANITIZE: jwt/refreshToken DAHIL EDILMEZ. */
export function mapTokenResponse(json: unknown): ShippingAuthResult {
  const rec = asRecord(json);
  const hasJwt = typeof rec.jwt === "string" && rec.jwt.length > 0;
  return {
    ok: hasJwt,
    expiresAt: toStringOrNull(rec.jwtExpireDate),
  };
}

/** /calculate → finalTotal (TL) kurusa cevrilir; kalemler sanitize. */
export function mapCalculateResponse(json: unknown): ShippingRateResult {
  const rec = asRecord(json);
  const finalTotal = toNumber(rec.finalTotal) ?? 0;
  const breakdownSafe: Record<string, number> = {};
  for (const key of ["transferRemuneration", "deliveryPrice", "smsPrice", "subTotal", "kdv"]) {
    const v = toNumber(rec[key]);
    if (v != null) breakdownSafe[key] = Math.round(v * 100);
  }
  return {
    amountMinor: Math.round(finalTotal * 100),
    currency: "TRY",
    breakdownSafe,
  };
}

export function mapCreateOrderResponse(json: unknown, referenceId: string): ShippingOrderCreateResult {
  const rec = asRecord(json);
  return {
    referenceId: toStringOrNull(rec.referenceId) ?? referenceId,
    externalOrderId: toStringOrNull(rec.orderInvoiceId),
    externalInvoiceId: toStringOrNull(rec.orderInvoiceDetailId),
    shipperBranchCode: toStringOrNull(rec.shipperBranchCode),
    returnLabelUrl: toStringOrNull(rec.returnOrderLabelURL),
  };
}

export function mapCreateBarcodeResponse(json: unknown, referenceId: string): ShippingBarcodeResult {
  const rec = asRecord(json);
  const rawBarcodes = Array.isArray(rec.barcodes) ? rec.barcodes : [];
  return {
    referenceId: toStringOrNull(rec.referenceId) ?? referenceId,
    externalShipmentId: toStringOrNull(rec.shipmentId),
    externalInvoiceId: toStringOrNull(rec.invoiceId),
    barcodes: rawBarcodes.map((b, i) => {
      const br = asRecord(b);
      return {
        pieceNumber: toNumber(br.pieceNumber) ?? i + 1,
        value: toStringOrNull(br.value) ?? "",
      };
    }),
  };
}

/** getshipmentstatus → trackingUrl/isDelivered/statusCode normalize. */
export function mapShipmentStatusResponse(json: unknown): ShippingShipmentStatusResult {
  const rec = asRecord(json);
  // getshipment yaniti `{ shipment: {...} }` sarmalayabilir; ikisini de destekle.
  const s = asRecord(rec.shipment ?? rec);
  return {
    referenceId: toStringOrNull(s.referenceId),
    externalShipmentId: toStringOrNull(s.shipmentId),
    statusCode: toNumber(s.shipmentStatusCode),
    statusText: toStringOrNull(s.shipmentStatus),
    isDelivered: toNumber(s.isDelivered) === 1,
    trackingUrl: toStringOrNull(s.trackingUrl),
    deliveryDateTime: toStringOrNull(s.deliveryDateTime ?? s.deliveryDate),
    deliveryTo: toStringOrNull(s.deliveryTo),
  };
}

/** trackshipment → hareket listesi normalize. */
export function mapTrackResponse(json: unknown): ShippingTrackingEventResult[] {
  const arr = Array.isArray(json) ? json : [];
  return arr.map((e) => {
    const rec = asRecord(e);
    return {
      sequence: toNumber(rec.eventSequence),
      statusText: toStringOrNull(rec.eventStatus),
      location: toStringOrNull(rec.location),
      occurredAt: toStringOrNull(rec.eventDateTime2 ?? rec.eventDateTime),
    };
  });
}

export function mapCitiesResponse(json: unknown): ShippingGeoResult {
  const arr = Array.isArray(json) ? json : [];
  return {
    cities: arr.map((c) => {
      const rec = asRecord(c);
      return { code: String(rec.code ?? ""), name: String(rec.name ?? "") };
    }),
  };
}

export function mapDistrictsResponse(json: unknown): ShippingGeoResult {
  const arr = Array.isArray(json) ? json : [];
  return {
    districts: arr.map((d) => {
      const rec = asRecord(d);
      return {
        code: String(rec.code ?? ""),
        name: String(rec.name ?? ""),
        cityCode: String(rec.cityCode ?? ""),
      };
    }),
  };
}
