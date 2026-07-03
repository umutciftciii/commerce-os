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
  // F3C.3 sandbox dogrulama: createOrder yaniti ARRAY doner
  // ([{ orderInvoiceId, orderInvoiceDetailId, shipperBranchCode, referenceId }]).
  // asRecord(array) alanlari bulamiyordu (BUG); ilk elemani al.
  const rec = asRecord(Array.isArray(json) ? json[0] : json);
  return {
    referenceId: toStringOrNull(rec.referenceId) ?? referenceId,
    externalOrderId: toStringOrNull(rec.orderInvoiceId),
    externalInvoiceId: toStringOrNull(rec.orderInvoiceDetailId),
    shipperBranchCode: toStringOrNull(rec.shipperBranchCode),
    returnLabelUrl: toStringOrNull(rec.returnOrderLabelURL),
  };
}

/**
 * TODO-132 — Saglayici domain HATA KODUNU guvenli sekilde cikarir (or. MNG 26039
 * "Recipient.Email gecerli degil"). Yalniz kisa alfanumerik kod doner; raw payload/
 * PII/secret TASINMAZ. Zarf: { error: { code|Code } } (camel/Pascal karisik) veya flat.
 */
export function extractProviderErrorCode(json: unknown): string | null {
  const outer = asRecord(Array.isArray(json) ? json[0] : json);
  const rec = outer.error && typeof outer.error === "object" ? asRecord(outer.error) : outer;
  const raw = rec.code ?? rec.Code ?? rec.errorCode;
  const code = typeof raw === "number" ? String(raw) : typeof raw === "string" ? raw.trim() : "";
  // Kisa alfanumerik kod disindaki her sey (mesaj cumlesi vb.) kod SAYILMAZ.
  return /^[A-Za-z0-9_-]{1,16}$/.test(code) ? code : null;
}

/** Saglayici domain hata mesajini guvenli sekilde cikarir (secret icermez). DHL hatalari
 * cogu zaman { message } / { errorMessage } / [{ message }] / { errors:[{message}] } seklinde
 * doner. Bos string null'a duser. */
export function extractProviderErrorMessage(json: unknown): string | null {
  const outer = asRecord(Array.isArray(json) ? json[0] : json);
  // F3C.6 sandbox dogrulama: MNG hata zarfi cogunlukla { error: { code|Code, message|Message,
  // description|Description } } seklinde NESTED doner (400 code 4002 camelCase, 500 code 20001
  // PascalCase gozlemlendi). description en spesifik alandir; once o denenir.
  const rec = outer.error && typeof outer.error === "object" ? asRecord(outer.error) : outer;
  // MNG domain (description/message/errorMessage) + IBM API Connect zarfı (httpMessage/
  // moreInformation) + MNG responseMessage. Secret icermez.
  const direct = toStringOrNull(
    rec.description ??
      rec.Description ??
      rec.message ??
      rec.Message ??
      rec.errorMessage ??
      (rec === outer ? rec.error : undefined) ??
      rec.responseMessage ??
      rec.httpMessage ??
      rec.moreInformation,
  );
  if (direct) return direct;
  const errs = rec.errors;
  if (Array.isArray(errs) && errs.length > 0) {
    return toStringOrNull(asRecord(errs[0]).message ?? asRecord(errs[0]).description);
  }
  return null;
}

/**
 * createbarcode yaniti normalize. F3C.3 (ADR-045) netlestirmesi:
 *  - `value` ZPL/etiket icerebilir (UZUN) → result'a tasinmaz; yalniz pieceNumber + kisa
 *    takip barkodu (`barcode`) ve labelPresent boolean tasinir. Raw ZPL ASLA log/DB'ye yazilmaz.
 *  - HTTP 200 ama shipmentId YOK ve barcodes BOS → providerReturnedEmptyPayload=true
 *    ("tam basarili barkod" degil; LABEL_PENDING + retry).
 *  - Saglayici domain hatasi (or. hat kodu bulunamadi) → providerErrorMessage dolu
 *    (BARCODE_FAILED + retryable). httpStatus>=400 da hata sayilir.
 */
export function mapCreateBarcodeResponse(
  json: unknown,
  referenceId: string,
  httpStatus = 200,
): ShippingBarcodeResult {
  // Bazi DHL yanitlari array sarmalayabilir; obje icinde barcodes ararken ilk elemana bak.
  const rec = asRecord(Array.isArray(json) ? json[0] : json);
  const rawBarcodes = Array.isArray(rec.barcodes) ? rec.barcodes : [];
  const externalShipmentId = toStringOrNull(rec.shipmentId);
  const barcodes = rawBarcodes.map((b, i) => {
    const br = asRecord(b);
    const value = typeof br.value === "string" ? br.value : "";
    return {
      pieceNumber: toNumber(br.pieceNumber) ?? i + 1,
      barcode: toStringOrNull(br.barcode),
      // labelPresent: `value` alani etiket/ZPL icerigi tasiyor mu.
      labelPresent: value.length > 0,
    };
  });
  const hasResult = Boolean(externalShipmentId) || barcodes.length > 0;
  const httpError = httpStatus >= 400;
  // HTTP hatasi VEYA sonuc yoksa hata mesaji cikar; HTTP hatasinda govde taninmazsa
  // generic fallback (provisioning/401 gibi tanınmayan zarflar pending'e DUSMESIN).
  const extracted = httpError || !hasResult ? extractProviderErrorMessage(json) : null;
  const providerErrorMessage = extracted ?? (httpError ? `Sağlayıcı hatası (HTTP ${httpStatus})` : null);
  // Hata YOK + sonuc YOK + HTTP basarili → bos payload (pending), hata degil.
  const providerReturnedEmptyPayload = !hasResult && !providerErrorMessage && !httpError;
  return {
    referenceId: toStringOrNull(rec.referenceId) ?? referenceId,
    externalShipmentId,
    externalInvoiceId: toStringOrNull(rec.invoiceId),
    barcodes,
    providerReturnedEmptyPayload,
    providerErrorMessage,
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
    // F3C.3 sandbox dogrulama: isDelivered BOOLEAN da olabilir (number degil).
    isDelivered: s.isDelivered === true || toNumber(s.isDelivered) === 1,
    trackingUrl: toStringOrNull(s.trackingUrl),
    deliveryDateTime: toStringOrNull(s.deliveryDateTime ?? s.deliveryDate),
    deliveryTo: toStringOrNull(s.deliveryTo),
  };
}

/** trackshipment → hareket listesi normalize. Yanit array VEYA tek obje olabilir. */
export function mapTrackResponse(json: unknown): ShippingTrackingEventResult[] {
  const arr = Array.isArray(json) ? json : json && typeof json === "object" ? [json] : [];
  return arr.map((e) => {
    const rec = asRecord(e);
    return {
      sequence: toNumber(rec.eventSequence),
      statusCode: toNumber(rec.eventStatusCode),
      statusText: toStringOrNull(rec.eventStatus ?? rec.eventStatusEn),
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
