import { createHash } from "node:crypto";
import type { ShippingProviderType } from "@prisma/client";
import { shippingWebhookEventRequestSchema } from "@commerce-os/contracts";

/**
 * TODO-130 — Saglayici HAM webhook payload'ini platform-normalize evente ceviren
 * adapter katmani. IMZA DOGRULAMA SONRASI cagrilir (guvenlik modeli webhook-routes'ta;
 * burada auth/imza YOKTUR ve raw govde asla loglanmaz/saklanmaz).
 *
 * Kapsam (ADR-055):
 *  - PLATFORM sozlesmesi (shippingWebhookEventRequestSchema) TUM saglayicilar icin
 *    calismaya devam eder (ADR-048 geriye uyum; MOCK/testler bu yolu kullanir).
 *  - DHL_ECOMMERCE (=MNG, api.mngkargo.com.tr): yalniz repoda GROUNDED sekiller —
 *    getshipmentstatus-benzeri durum push'u ve trackshipment-benzeri hareket push'u
 *    (alan adlari mappers.ts'teki dogrulanmis OpenAPI eslemeleriyle birebir).
 *    Resmi push ornegi olmayan alan adlari UYDURULMAZ.
 *  - GELIVER: repoda hicbir ham payload ornegi yok → guvenli UNSUPPORTED
 *    (ornek payload gelene kadar shipment mutasyonu yapilamaz).
 *
 * Bilinmeyen/parse edilemeyen sekil hicbir zaman throw ETMEZ; unsupported doner.
 */

export interface NormalizedShipmentWebhookEvent {
  /** Saglayici event kimligi (varsa) — idempotency icin en guclu anahtar. */
  eventId: string | null;
  referenceId: string | null;
  trackingNumber: string | null;
  externalShipmentId: string | null;
  /** Saglayici durum kodu (MNG/DHL 0-7 normalize eslemesi status-map'te). */
  statusCode: number | null;
  statusText: string | null;
  /** Yalniz payload KANIT tasiyorsa true (isDelivered alani ya da kod 5 ESLEMESI degil — eslemeyi status-map yapar). */
  isDelivered: boolean;
  location: string | null;
  /** Ham tarih stringi; parse status-map.parseProviderDate ile route'ta yapilir. */
  occurredAtRaw: string | null;
  trackingUrl: string | null;
}

export type WebhookPayloadFormat = "PLATFORM" | "DHL_STATUS" | "DHL_TRACKING";

export type WebhookNormalizationResult =
  | { supported: true; format: WebhookPayloadFormat; events: NormalizedShipmentWebhookEvent[] }
  | { supported: false; reason: WebhookUnsupportedReason };

export type WebhookUnsupportedReason =
  | "INVALID_JSON"
  | "UNSUPPORTED_PAYLOAD"
  | "AMBIGUOUS_SHIPMENT_IDS"
  | "GELIVER_SAMPLE_REQUIRED";

/* ───────────────────────── Guvenli okuma yardimcilari ───────────────────────── */

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 && trimmed.length <= 500 ? trimmed : null;
  }
  return null;
}

function toIdOrNull(value: unknown): string | null {
  // Saglayici id/barkod alanlari sayi da donebilir (MNG shipmentId gozlemi).
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  const s = toStringOrNull(value);
  return s && s.length <= 200 ? s : null;
}

function toStatusCode(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d{1,6}$/.test(value.trim())) return Number(value.trim());
  return null;
}

/* ───────────────────────── PLATFORM sozlesmesi (ADR-048) ───────────────────────── */

function tryPlatformContract(json: unknown): NormalizedShipmentWebhookEvent | null {
  const parsed = shippingWebhookEventRequestSchema.safeParse(json);
  if (!parsed.success) return null;
  const e = parsed.data;
  // Sozlesmenin TUM alanlari opsiyonel oldugundan her JSON objesi parse GECER;
  // PLATFORM sayilmak icin en az bir eslestirme kimligi ZORUNLU (aksi halde ham
  // saglayici sekilleri hic denenemezdi). Kimliksiz payload'in sonucu degismez:
  // ham sekiller de kimlik ister → yine IGNORED_UNSUPPORTED.
  if (!e.referenceId && !e.trackingNumber && !e.externalShipmentId) return null;
  return {
    eventId: e.eventId ?? null,
    referenceId: e.referenceId ?? null,
    trackingNumber: e.trackingNumber ?? null,
    externalShipmentId: e.externalShipmentId ?? null,
    statusCode: e.statusCode ?? null,
    statusText: e.statusText ?? null,
    isDelivered: e.isDelivered === true,
    location: e.location ?? null,
    occurredAtRaw: e.occurredAt ?? null,
    trackingUrl: e.trackingUrl ?? null,
  };
}

/* ───────────────────────── DHL_ECOMMERCE (MNG) ham sekiller ─────────────────────────
 * getshipmentstatus yaniti (mappers.mapShipmentStatusResponse ile ayni alanlar):
 *   { shipment?: { referenceId, shipmentId, shipmentStatusCode, shipmentStatus,
 *     isDelivered, trackingUrl, deliveryDateTime|deliveryDate, barcode? } }
 * trackshipment hareketi (mappers.mapTrackResponse ile ayni alanlar):
 *   { eventSequence, eventStatusCode, eventStatus|eventStatusEn, location,
 *     eventDateTime2|eventDateTime, referenceId?, shipmentId?, barcode? }
 */

function extractDhlIdentifiers(rec: Record<string, unknown>): {
  referenceId: string | null;
  externalShipmentId: string | null;
  trackingNumber: string | null;
} {
  return {
    referenceId: toIdOrNull(rec.referenceId),
    externalShipmentId: toIdOrNull(rec.shipmentId),
    trackingNumber: toIdOrNull(rec.barcode ?? rec.trackingNumber),
  };
}

function hasAnyIdentifier(ids: {
  referenceId: string | null;
  externalShipmentId: string | null;
  trackingNumber: string | null;
}): boolean {
  return Boolean(ids.referenceId || ids.externalShipmentId || ids.trackingNumber);
}

/** getshipmentstatus-benzeri durum push'u. Kimlik + durum sinyali ZORUNLU. */
function tryDhlStatusShape(json: unknown): NormalizedShipmentWebhookEvent | null {
  const outer = asRecord(json);
  const rec = asRecord(outer.shipment ?? outer);
  const ids = extractDhlIdentifiers(rec);
  if (!hasAnyIdentifier(ids)) return null;
  const statusCode = toStatusCode(rec.shipmentStatusCode);
  const statusText = toStringOrNull(rec.shipmentStatus);
  const isDelivered = rec.isDelivered === true || toStatusCode(rec.isDelivered) === 1;
  // Durum sinyali yoksa bu bir durum push'u DEGILDIR (uydurma esleme yok).
  if (statusCode == null && statusText == null && !isDelivered) return null;
  return {
    eventId: toIdOrNull(outer.eventId ?? rec.eventId),
    ...ids,
    statusCode,
    statusText,
    isDelivered,
    location: null,
    occurredAtRaw: toStringOrNull(rec.deliveryDateTime ?? rec.deliveryDate),
    trackingUrl: toStringOrNull(rec.trackingUrl),
  };
}

/** Tek trackshipment hareketini normalize eder (kimliksiz hareket null). */
function tryDhlTrackingElement(
  json: unknown,
  inherited: ReturnType<typeof extractDhlIdentifiers> | null,
): NormalizedShipmentWebhookEvent | null {
  const rec = asRecord(json);
  const ownIds = extractDhlIdentifiers(rec);
  const ids = hasAnyIdentifier(ownIds) ? ownIds : inherited;
  if (!ids || !hasAnyIdentifier(ids)) return null;
  const statusCode = toStatusCode(rec.eventStatusCode);
  const statusText = toStringOrNull(rec.eventStatus ?? rec.eventStatusEn);
  const occurredAtRaw = toStringOrNull(rec.eventDateTime2 ?? rec.eventDateTime);
  // Hareket icerigi yoksa (kod/metin/tarih hicbiri) bu bir hareket degildir.
  if (statusCode == null && statusText == null && occurredAtRaw == null) return null;
  return {
    eventId: toIdOrNull(rec.eventId),
    ...ids,
    statusCode,
    statusText,
    isDelivered: false,
    location: toStringOrNull(rec.location),
    occurredAtRaw,
    trackingUrl: toStringOrNull(rec.trackingUrl),
  };
}

/**
 * trackshipment-benzeri hareket push'u: dizi, tek hareket ya da
 * { referenceId/shipmentId/barcode, events: [...] } sarmali. Farkli gonderilere ait
 * kimlikler tek teslimatta gelirse TAHMIN EDILMEZ → ambiguous.
 */
function tryDhlTrackingShape(json: unknown): WebhookNormalizationResult | null {
  let elements: unknown[] | null = null;
  let inherited: ReturnType<typeof extractDhlIdentifiers> | null = null;
  if (Array.isArray(json)) {
    elements = json;
  } else {
    const rec = asRecord(json);
    if (Array.isArray(rec.events)) {
      elements = rec.events;
      const wrapperIds = extractDhlIdentifiers(rec);
      inherited = hasAnyIdentifier(wrapperIds) ? wrapperIds : null;
    } else if (rec.eventStatusCode !== undefined || rec.eventStatus !== undefined || rec.eventDateTime !== undefined || rec.eventDateTime2 !== undefined) {
      elements = [json];
    }
  }
  if (!elements || elements.length === 0) return null;

  const events: NormalizedShipmentWebhookEvent[] = [];
  for (const el of elements) {
    const ev = tryDhlTrackingElement(el, inherited);
    if (ev) events.push(ev);
  }
  if (events.length === 0) return null;

  // Tum hareketler AYNI gonderiye ait olmali (MNG trackshipment gonderi-bazlidir).
  const distinct = new Set(
    events.map((e) => `${e.referenceId ?? ""}|${e.externalShipmentId ?? ""}|${e.trackingNumber ?? ""}`),
  );
  if (distinct.size > 1) return { supported: false, reason: "AMBIGUOUS_SHIPMENT_IDS" };
  return { supported: true, format: "DHL_TRACKING", events };
}

/* ───────────────────────── Ana normalize dispatch ───────────────────────── */

export function normalizeShippingWebhookPayload(
  provider: ShippingProviderType,
  json: unknown,
): WebhookNormalizationResult {
  // PLATFORM sozlesmesi her saglayici icin oncelikli calisir (ADR-048 geriye uyum).
  const platform = tryPlatformContract(json);
  if (platform) return { supported: true, format: "PLATFORM", events: [platform] };

  if (provider === "DHL_ECOMMERCE") {
    const status = tryDhlStatusShape(json);
    if (status) return { supported: true, format: "DHL_STATUS", events: [status] };
    const tracking = tryDhlTrackingShape(json);
    if (tracking) return tracking;
    return { supported: false, reason: "UNSUPPORTED_PAYLOAD" };
  }
  if (provider === "GELIVER") {
    // Repoda grounded Geliver webhook ornegi YOK; ornek gelene kadar guvenli unsupported.
    return { supported: false, reason: "GELIVER_SAMPLE_REQUIRED" };
  }
  return { supported: false, reason: "UNSUPPORTED_PAYLOAD" };
}

/* ───────────────────────── Event key (idempotency) ─────────────────────────
 * Inbox unique (providerConfigId, eventKey) dedupe KAPISI DEGISMEDI (ADR-048).
 * PLATFORM yolu mevcut anahtari korur (evt:<id> / sha256:<rawBody>); ham saglayici
 * sekilleri icin volatil alan icermeyen NORMALIZE deterministik hash kullanilir
 * (ayni saglayici eventi → ayni anahtar; farkli event → farkli anahtar).
 */

function normalizedEventFingerprint(e: NormalizedShipmentWebhookEvent): string {
  return [
    e.referenceId ?? "",
    e.externalShipmentId ?? "",
    e.trackingNumber ?? "",
    e.statusCode == null ? "" : String(e.statusCode),
    e.statusText ?? "",
    e.isDelivered ? "1" : "0",
    e.location ?? "",
    e.occurredAtRaw ?? "",
  ].join("|");
}

export function computeNormalizedWebhookEventKey(
  provider: ShippingProviderType,
  events: NormalizedShipmentWebhookEvent[],
): string {
  const withId = events.length === 1 ? events[0]?.eventId : null;
  if (withId) return `evt:${withId}`;
  const digest = createHash("sha256")
    .update(`${provider}\n${events.map(normalizedEventFingerprint).join("\n")}`, "utf8")
    .digest("hex");
  return `nrm:${digest}`;
}
