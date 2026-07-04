/**
 * TODO-123 — Provider-agnostic barkod olusturma + retry/backoff cekirdegi.
 *
 * Hem MANUEL admin ucu (routes.ts: applyCreateLabel → dhl/barcode + create-label) hem
 * zamanlanmis retry worker (barcode-retry-worker.ts) AYNI cekirdegi kullanir → davranis
 * drift'i olmaz. Guvenlik/dogruluk garantileri:
 *  - SAHTE basari YOK: durum yalniz saglayici KANITIYLA ilerler (barcodes/shipmentId).
 *    Bos 200 → LABEL_PENDING (retry mumkun); hata → durum DEGISMEZ.
 *  - Duplicate guard'a DOKUNULMAZ: yeni Shipment ACILMAZ; yalniz mevcut kayit denenir.
 *  - Retry SINIFLANDIRMASI:
 *      RETRYABLE  → transient (timeout/5xx/network/generic) → backoff ile otomatik denenir.
 *      DATA_FIX   → varis/adres eslemesi gecersiz (DESTINATION_BRANCH_NOT_FOUND vb.) →
 *                   OTOMATIK denenmez; admin duzeltmesi (TODO-124/139) lastBarcodeErrorCode
 *                   + retry metadata'sini sifirlayana kadar bloklu.
 *      TERMINAL   → kalici/desteklenmeyen (AUTH_FAILED, disabled) → otomatik denenmez.
 *  - Idempotent event: BARCODE_FAILED yalniz ilk hata / hata kodu degisince / blok nedeni
 *    degisince (or. yeni MAX_ATTEMPTS) yazilir. Ayni hata her turda event URETMEZ.
 *  - Raw saglayici payload/ZPL/secret ASLA loglanmaz/DB'ye yazilmaz (yalniz sanitize ozet).
 */
import { prisma } from "@commerce-os/db";
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { Prisma } from "@prisma/client";
import type { ShipmentStatus, ShippingProviderType } from "@prisma/client";
import { ShippingConfigError } from "./errors.js";
import type { ShippingAdapterRegistry } from "./adapters/registry.js";
import { buildShippingActionContext, type ConfigWithCredentials } from "./context.js";
import { providerSupportsBarcodeRetry } from "./serialize.js";
import {
  BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND,
  classifyBarcodeProviderError,
} from "./adapters/dhl-ecommerce/mappers.js";
import type { ShippingBarcodeResult } from "./types.js";

/* ───────────────────────── Retry sinif­landirmasi ───────────────────────── */

export type BarcodeRetryClass = "RETRYABLE" | "DATA_FIX" | "TERMINAL";
/** barcodeRetryBlockedReason degerleri (lastBarcodeErrorCode'dan AYRIDIR). */
export type BarcodeRetryBlockedReason = "DATA_FIX" | "TERMINAL" | "MAX_ATTEMPTS";

/** Admin duzeltmesi bekleyen (otomatik denenmeyen) veri hatalari. */
const DATA_FIX_CODES = new Set<string>([
  BARCODE_ERROR_DESTINATION_BRANCH_NOT_FOUND,
  "ADDRESS_DISTRICT_CODE_REQUIRED",
  "CBS_CODE_INVALID",
  "RECIPIENT_EMAIL_REQUIRED",
  "RECIPIENT_EMAIL_INVALID",
]);

/** Kalici/desteklenmeyen hatalar (backoff'la duzelmez; otomatik denenmez). */
const TERMINAL_CODES = new Set<string>([
  "AUTH_FAILED",
  "SHIPPING_HTTP_DISABLED",
  "BARCODE_CREATE_DISABLED",
  "RECIPIENT_CREATE_DISABLED",
  "ORDER_CREATE_DISABLED",
  "LABEL_PURCHASE_DISABLED",
  "CONFIG_MISSING",
  "CONFIG_INVALID",
  "CONFIG_INCOMPLETE",
  "TEST_BASE_URL_MISSING",
  "NOT_IMPLEMENTED",
  "OPERATION_NOT_SUPPORTED",
]);

/** Generic transient (sinif­landirilamayan saglayici) barkod hatasi kodu. */
export const BARCODE_ERROR_PROVIDER = "BARCODE_PROVIDER_ERROR";
/** Ag/istisna (ShippingConfigError olmayan) hata kodu — transient sayilir. */
export const BARCODE_ERROR_NETWORK = "PROVIDER_NETWORK_ERROR";

/** Bilinen sanitize hata KODUNU retry sinifina esler (uydurma yok; bilinmeyen → RETRYABLE). */
export function classifyBarcodeErrorClass(code: string): BarcodeRetryClass {
  if (DATA_FIX_CODES.has(code)) return "DATA_FIX";
  if (TERMINAL_CODES.has(code)) return "TERMINAL";
  return "RETRYABLE";
}

/** Yakalanan saglayici domain hatasini ({message,code}) sanitize koda + sinifa cevirir. */
export function classifyCapturedBarcodeError(
  providerErrorCode: string | null,
  providerErrorMessage: string | null,
): { code: string; retryClass: BarcodeRetryClass } {
  const classified = classifyBarcodeProviderError(providerErrorCode, providerErrorMessage);
  const code = classified ?? BARCODE_ERROR_PROVIDER;
  return { code, retryClass: classifyBarcodeErrorClass(code) };
}

/** Firlatilan hatayi (timeout/disabled/auth/network) sanitize koda + sinifa cevirir. */
export function classifyThrownBarcodeError(error: unknown): { code: string; retryClass: BarcodeRetryClass } {
  if (error instanceof ShippingConfigError) {
    return { code: error.code, retryClass: classifyBarcodeErrorClass(error.code) };
  }
  return { code: BARCODE_ERROR_NETWORK, retryClass: "RETRYABLE" };
}

/* ───────────────────────── Backoff ───────────────────────── */

/** Ussel backoff: staleAfter * 2^(attempt-1), 6 saatle sinirli (worker'i bogmamak icin). */
const BARCODE_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
export function computeBarcodeBackoffMs(staleAfterMs: number, attempts: number): number {
  const exp = Math.min(Math.max(attempts - 1, 0), 20);
  return Math.min(staleAfterMs * 2 ** exp, BARCODE_BACKOFF_MAX_MS);
}

/* ───────────────────────── Kayit/persistence sozlesmeleri ───────────────────────── */

/** Barkod denemesi/retry cekirdeginin ihtiyac duydugu shipment projeksiyonu. */
export interface BarcodeShipmentRecord {
  id: string;
  storeId: string;
  providerConfigId: string;
  provider: ShippingProviderType;
  referenceId: string;
  status: ShipmentStatus;
  packagingType: number | null;
  pieceCount: number;
  totalKg: number;
  totalDesi: number;
  externalShipmentId: string | null;
  externalInvoiceId: string | null;
  trackingNumber: string | null;
  lastBarcodeErrorCode: string | null;
  barcodeRetryCount: number;
  barcodeRetryBlockedReason: string | null;
}

export interface BarcodeEligibleQuery {
  statuses: ShipmentStatus[];
  providers: ShippingProviderType[];
  batchSize: number;
  /** Worker secimi: barcodeNextRetryAt <= now. null => backoff filtresi yok (manuel bypass). */
  now: Date | null;
  /** Worker secimi: barcodeRetryCount < maxAttempts. null => esik yok. */
  maxAttempts: number | null;
  storeId?: string;
}

export interface BarcodeSuccessInput {
  shipmentId: string;
  storeId: string;
  provider: ShippingProviderType;
  status: "LABEL_CREATED" | "LABEL_PENDING";
  externalShipmentId: string | null;
  externalInvoiceId: string | null;
  trackingNumber: string | null;
  barcodeJsonSafe: Prisma.InputJsonValue;
  at: Date;
  /** Timeline event (LABEL_CREATED → BARCODE_CREATED; LABEL_PENDING → BARCODE_PENDING). */
  eventType: "BARCODE_CREATED" | "BARCODE_PENDING";
  eventStatusText: string;
}

export interface BarcodeFailureInput {
  shipmentId: string;
  storeId: string;
  provider: ShippingProviderType;
  errorCode: string;
  blockedReason: BarcodeRetryBlockedReason | null;
  retryCount: number;
  nextRetryAt: Date | null;
  at: Date;
  /** Idempotent event: yalniz ilk hata/kod degisimi/yeni blok nedeninde dolu. */
  event: { statusText: string; rawSafeJson: Prisma.InputJsonValue } | null;
}

export interface BarcodeRetryPersistence {
  findEligibleBarcodeShipments(query: BarcodeEligibleQuery): Promise<BarcodeShipmentRecord[]>;
  loadProviderConfig(storeId: string, providerConfigId: string): Promise<ConfigWithCredentials | null>;
  applyBarcodeSuccess(input: BarcodeSuccessInput): Promise<void>;
  recordBarcodeFailure(input: BarcodeFailureInput): Promise<void>;
}

/* ───────────────────────── Sonuc modelleri ───────────────────────── */

export type BarcodeAttemptOutcome =
  | { kind: "label" }
  | { kind: "pending" }
  | { kind: "failed"; errorCode: string; retryClass: BarcodeRetryClass; blockedReason: BarcodeRetryBlockedReason | null };

export type BarcodeRetryOutcome =
  | "LABEL_CREATED"
  | "LABEL_PENDING"
  | "RETRY_SCHEDULED"
  | "BLOCKED_DATA_FIX"
  | "BLOCKED_TERMINAL"
  | "BLOCKED_MAX_ATTEMPTS"
  | "SKIPPED_DISABLED"
  | "SKIPPED_UNSUPPORTED";

export interface BarcodeRetryResultItem {
  shipmentId: string;
  storeId: string;
  provider: ShippingProviderType;
  outcome: BarcodeRetryOutcome;
  errorCode: string | null;
}

export interface BarcodeRetrySummary {
  scanned: number;
  created: number;
  scheduled: number;
  blocked: number;
  skipped: number;
  results: BarcodeRetryResultItem[];
}

export interface BarcodeRetryServiceDeps {
  config: AppConfig;
  registry: ShippingAdapterRegistry;
  persistence: BarcodeRetryPersistence;
  logger?: Logger;
  now?: () => Date;
}

export interface BarcodeAttemptOptions {
  packagingType?: number;
  explicitConfirm: boolean;
  /** manual: firlatilan (timeout/terminal) hatayi route'a YENIDEN firlatir (HTTP mapping korunur). */
  trigger: "manual" | "worker";
}

export interface BarcodeRetryEligibleOptions {
  storeId?: string;
  batchSize?: number;
}

export interface BarcodeRetryService {
  /** Tek gonderi icin barkod denemesi (manuel + worker ortak). DB yazimini persistence yapar. */
  attemptBarcode(
    shipment: BarcodeShipmentRecord,
    cfg: ConfigWithCredentials,
    opts: BarcodeAttemptOptions,
  ): Promise<BarcodeAttemptOutcome>;
  /** Uygun (transient hatali, backoff dolmus) gonderileri secer ve izole denemeler yurutur. */
  retryEligibleBarcodes(options?: BarcodeRetryEligibleOptions): Promise<BarcodeRetrySummary>;
}

/** Barkod parca listesi (createbarcode icin yeniden uretilebilir; adres/olcuden turer). */
function rebuildPieces(shipment: BarcodeShipmentRecord) {
  const count = Math.max(1, shipment.pieceCount);
  return Array.from({ length: count }, (_, i) => ({
    barcode: `${shipment.referenceId.toUpperCase()}_PARCA${i + 1}`,
    desi: shipment.totalDesi / count || 0,
    kg: shipment.totalKg / count || 0,
  }));
}

/** Saglayici barkod yanitini sanitize ozete cevirir (raw ZPL/secret TASINMAZ). */
function buildBarcodeJsonSafe(result: ShippingBarcodeResult, incomplete: boolean): Prisma.InputJsonValue {
  const shipmentIdPresent = Boolean(result.externalShipmentId);
  return {
    referenceId: result.referenceId,
    shipmentId: result.externalShipmentId,
    invoiceId: result.externalInvoiceId,
    barcodeCount: result.barcodes.length,
    zplPresent: result.barcodes.some((b) => b.labelPresent),
    shipmentIdPresent,
    invoiceIdPresent: Boolean(result.externalInvoiceId),
    providerReturnedEmptyPayload: incomplete,
    pieces: result.barcodes.map((b) => ({ pieceNumber: b.pieceNumber, barcodePresent: Boolean(b.barcode) })),
  } satisfies Prisma.InputJsonValue;
}

export function createBarcodeRetryService(deps: BarcodeRetryServiceDeps): BarcodeRetryService {
  const now = deps.now ?? (() => new Date());
  const staleAfterMs = deps.config.BARCODE_RETRY_STALE_AFTER_MINUTES * 60 * 1000;
  const maxAttempts = deps.config.BARCODE_RETRY_MAX_ATTEMPTS;

  /** Hata metadata'sini hesaplar + idempotent event kararini verir; persistence'a yazdirir. */
  async function persistFailure(
    shipment: BarcodeShipmentRecord,
    errorCode: string,
    retryClass: BarcodeRetryClass,
    at: Date,
    detail: Prisma.InputJsonValue,
  ): Promise<{ blockedReason: BarcodeRetryBlockedReason | null; retryCount: number }> {
    let blockedReason: BarcodeRetryBlockedReason | null;
    let retryCount = shipment.barcodeRetryCount;
    let nextRetryAt: Date | null;

    if (retryClass === "RETRYABLE") {
      retryCount = shipment.barcodeRetryCount + 1;
      if (retryCount >= maxAttempts) {
        blockedReason = "MAX_ATTEMPTS";
        nextRetryAt = null; // worker SECMEZ; manuel retry calisir.
      } else {
        blockedReason = null;
        nextRetryAt = new Date(at.getTime() + computeBarcodeBackoffMs(staleAfterMs, retryCount));
      }
    } else {
      blockedReason = retryClass === "DATA_FIX" ? "DATA_FIX" : "TERMINAL";
      nextRetryAt = null; // admin duzeltmesi / manuel kontrol bekler.
    }

    // Idempotent event: ilk hata (kod degisti) VEYA yeni blok nedeni (or. yeni MAX_ATTEMPTS/
    // DATA_FIX/TERMINAL) → BARCODE_FAILED yaz. Ayni kod + ayni blok → event YAZILMAZ.
    const codeChanged = shipment.lastBarcodeErrorCode !== errorCode;
    const blockChanged = blockedReason !== null && shipment.barcodeRetryBlockedReason !== blockedReason;
    const writeEvent = codeChanged || blockChanged;

    await deps.persistence.recordBarcodeFailure({
      shipmentId: shipment.id,
      storeId: shipment.storeId,
      provider: shipment.provider,
      errorCode,
      blockedReason,
      retryCount,
      nextRetryAt,
      at,
      event: writeEvent
        ? {
            statusText:
              retryClass === "DATA_FIX"
                ? "Adres/varış eşlemesi düzeltilmeli (otomatik tekrar denenmeyecek)."
                : retryClass === "TERMINAL"
                  ? "Barkod oluşturma kalıcı olarak başarısız (otomatik tekrar denenmeyecek)."
                  : blockedReason === "MAX_ATTEMPTS"
                    ? "Barkod otomatik deneme limiti doldu. Manuel kontrol gerekiyor."
                    : "Barkod oluşturma geçici olarak başarısız oldu. Sistem tekrar deneyecek.",
            rawSafeJson: detail,
          }
        : null,
    });
    return { blockedReason, retryCount };
  }

  async function attemptBarcode(
    shipment: BarcodeShipmentRecord,
    cfg: ConfigWithCredentials,
    opts: BarcodeAttemptOptions,
  ): Promise<BarcodeAttemptOutcome> {
    const at = now();
    let result: ShippingBarcodeResult;
    try {
      result = await deps.registry.get(cfg.provider).createBarcodeOrLabel({
        context: buildShippingActionContext(deps.config, cfg),
        referenceId: shipment.referenceId,
        packagingType: opts.packagingType ?? shipment.packagingType ?? undefined,
        pieces: rebuildPieces(shipment),
        explicitConfirm: opts.explicitConfirm,
      });
    } catch (error) {
      // Firlatilan hata (timeout/network/auth/disabled): durum ILERLEMEZ; metadata + event yaz.
      const { code, retryClass } = classifyThrownBarcodeError(error);
      const { blockedReason } = await persistFailure(shipment, code, retryClass, at, {
        providerError: true,
        thrown: true,
        errorCode: code,
      });
      // Manuel tetikte HTTP mapping'i korumak icin (504 timeout vb.) hatayi YENIDEN firlat.
      if (opts.trigger === "manual") throw error;
      return { kind: "failed", errorCode: code, retryClass, blockedReason };
    }

    // Yakalanan saglayici domain hatasi (providerErrorMessage dolu).
    if (result.providerErrorMessage) {
      const { code, retryClass } = classifyCapturedBarcodeError(result.providerErrorCode, result.providerErrorMessage);
      const { blockedReason } = await persistFailure(shipment, code, retryClass, at, {
        providerError: true,
        errorCode: code,
        providerErrorCode: result.providerErrorCode,
        message: result.providerErrorMessage,
        shipmentIdPresent: Boolean(result.externalShipmentId),
        barcodeCount: result.barcodes.length,
      });
      return { kind: "failed", errorCode: code, retryClass, blockedReason };
    }

    const shipmentIdPresent = Boolean(result.externalShipmentId);
    const barcodeCount = result.barcodes.length;
    const incomplete = result.providerReturnedEmptyPayload || (!shipmentIdPresent && barcodeCount === 0);
    const barcodeJsonSafe = buildBarcodeJsonSafe(result, incomplete);

    if (incomplete) {
      // Bos 200 = pending (saglayici DOMAIN hatasi degil) → retry metadata SIFIRLANIR.
      await deps.persistence.applyBarcodeSuccess({
        shipmentId: shipment.id,
        storeId: shipment.storeId,
        provider: shipment.provider,
        status: "LABEL_PENDING",
        externalShipmentId: null,
        externalInvoiceId: null,
        trackingNumber: null,
        barcodeJsonSafe,
        at,
        eventType: "BARCODE_PENDING",
        eventStatusText: "Barkod henüz üretilemedi (sağlayıcı boş yanıt)",
      });
      return { kind: "pending" };
    }

    await deps.persistence.applyBarcodeSuccess({
      shipmentId: shipment.id,
      storeId: shipment.storeId,
      provider: shipment.provider,
      status: "LABEL_CREATED",
      externalShipmentId: result.externalShipmentId,
      externalInvoiceId: result.externalInvoiceId ?? shipment.externalInvoiceId,
      trackingNumber: result.externalShipmentId ?? shipment.trackingNumber,
      barcodeJsonSafe,
      at,
      eventType: "BARCODE_CREATED",
      eventStatusText: "Barkod oluşturuldu",
    });
    return { kind: "label" };
  }

  /** Gonderi basina izole yurutme: skip/hata batch'i durdurmaz, sonuc kaydi doner. */
  async function retryOneSafely(
    shipment: BarcodeShipmentRecord,
    cfg: ConfigWithCredentials | null,
  ): Promise<BarcodeRetryResultItem> {
    const base = { shipmentId: shipment.id, storeId: shipment.storeId, provider: shipment.provider };
    if (!cfg || cfg.status !== "ENABLED") {
      return { ...base, outcome: "SKIPPED_DISABLED", errorCode: shipment.lastBarcodeErrorCode };
    }
    if (!providerSupportsBarcodeRetry(cfg.provider)) {
      return { ...base, outcome: "SKIPPED_UNSUPPORTED", errorCode: shipment.lastBarcodeErrorCode };
    }
    try {
      const outcome = await attemptBarcode(shipment, cfg, { explicitConfirm: true, trigger: "worker" });
      if (outcome.kind === "label") return { ...base, outcome: "LABEL_CREATED", errorCode: null };
      if (outcome.kind === "pending") return { ...base, outcome: "LABEL_PENDING", errorCode: null };
      const outcomeByReason: Record<BarcodeRetryBlockedReason, BarcodeRetryOutcome> = {
        DATA_FIX: "BLOCKED_DATA_FIX",
        TERMINAL: "BLOCKED_TERMINAL",
        MAX_ATTEMPTS: "BLOCKED_MAX_ATTEMPTS",
      };
      return {
        ...base,
        outcome: outcome.blockedReason ? outcomeByReason[outcome.blockedReason] : "RETRY_SCHEDULED",
        errorCode: outcome.errorCode,
      };
    } catch (error) {
      // trigger:"worker" firlatilan hatayi zaten yakalar; buraya beklenmedik hata dusebilir.
      const errorCode = error instanceof ShippingConfigError ? error.code : BARCODE_ERROR_NETWORK;
      return { ...base, outcome: "RETRY_SCHEDULED", errorCode };
    }
  }

  async function retryEligibleBarcodes(options?: BarcodeRetryEligibleOptions): Promise<BarcodeRetrySummary> {
    const nowAt = now();
    const shipments = await deps.persistence.findEligibleBarcodeShipments({
      statuses: BARCODE_RETRY_STATUSES,
      providers: ["DHL_ECOMMERCE"],
      batchSize: options?.batchSize ?? deps.config.BARCODE_RETRY_BATCH_SIZE,
      now: nowAt,
      maxAttempts,
      storeId: options?.storeId,
    });

    const cfgCache = new Map<string, ConfigWithCredentials | null>();
    const results: BarcodeRetryResultItem[] = [];
    for (const shipment of shipments) {
      let cfg = cfgCache.get(shipment.providerConfigId);
      if (cfg === undefined) {
        cfg = await deps.persistence.loadProviderConfig(shipment.storeId, shipment.providerConfigId);
        cfgCache.set(shipment.providerConfigId, cfg);
      }
      results.push(await retryOneSafely(shipment, cfg));
    }

    const summary: BarcodeRetrySummary = {
      scanned: shipments.length,
      created: results.filter((r) => r.outcome === "LABEL_CREATED" || r.outcome === "LABEL_PENDING").length,
      scheduled: results.filter((r) => r.outcome === "RETRY_SCHEDULED").length,
      blocked: results.filter(
        (r) =>
          r.outcome === "BLOCKED_DATA_FIX" ||
          r.outcome === "BLOCKED_TERMINAL" ||
          r.outcome === "BLOCKED_MAX_ATTEMPTS",
      ).length,
      skipped: results.filter((r) => r.outcome === "SKIPPED_DISABLED" || r.outcome === "SKIPPED_UNSUPPORTED").length,
      results,
    };
    // Guvenli ozet log: id/store/provider/durum/kod — raw payload/secret ASLA.
    for (const r of results) {
      if (r.outcome === "LABEL_CREATED" || r.outcome === "LABEL_PENDING") {
        deps.logger?.info("barcode retry created", { shipmentId: r.shipmentId, storeId: r.storeId, provider: r.provider, outcome: r.outcome });
      } else if (r.outcome === "RETRY_SCHEDULED") {
        deps.logger?.warn("barcode retry scheduled", { shipmentId: r.shipmentId, storeId: r.storeId, provider: r.provider, errorCode: r.errorCode });
      }
    }
    return summary;
  }

  return { attemptBarcode, retryEligibleBarcodes };
}

/** Barkod retry'inin uygun gonderi statuleri (barkod ONCESI, kilitli/terminal DEGIL). */
export const BARCODE_RETRY_STATUSES: ShipmentStatus[] = ["ORDER_CREATED", "LABEL_PENDING"];

/* ───────────── Prisma persistence (runtime wiring) ───────────── */

/** Barkod basari/pending sonrasi retry metadata'si tamamen sifirlanir. */
const BARCODE_RETRY_RESET = {
  lastBarcodeErrorCode: null,
  barcodeRetryCount: 0,
  barcodeNextRetryAt: null,
  barcodeRetryBlockedReason: null,
} satisfies Prisma.ShipmentUpdateInput;

/** Adres/varis onarimi (TODO-124/139) sonrasi retry blogunu kaldirir (basari degil; deneme serbest). */
export const BARCODE_RETRY_UNBLOCK: Prisma.ShipmentUpdateInput = {
  lastBarcodeErrorCode: null,
  barcodeRetryCount: 0,
  barcodeNextRetryAt: null,
  barcodeRetryBlockedReason: null,
};

export function createPrismaBarcodeRetryPersistence(): BarcodeRetryPersistence {
  return {
    async findEligibleBarcodeShipments(query) {
      return prisma.shipment.findMany({
        where: {
          ...(query.storeId ? { storeId: query.storeId } : {}),
          status: { in: query.statuses },
          provider: { in: query.providers },
          // Bloklu (DATA_FIX/TERMINAL/MAX_ATTEMPTS) veya hatasiz gonderi SECILMEZ.
          barcodeRetryBlockedReason: null,
          lastBarcodeErrorCode: { not: null },
          ...(query.maxAttempts != null ? { barcodeRetryCount: { lt: query.maxAttempts } } : {}),
          ...(query.now ? { barcodeNextRetryAt: { not: null, lte: query.now } } : { barcodeNextRetryAt: { not: null } }),
        },
        orderBy: { barcodeNextRetryAt: "asc" },
        take: query.batchSize,
        select: {
          id: true,
          storeId: true,
          providerConfigId: true,
          provider: true,
          referenceId: true,
          status: true,
          packagingType: true,
          pieceCount: true,
          totalKg: true,
          totalDesi: true,
          externalShipmentId: true,
          externalInvoiceId: true,
          trackingNumber: true,
          lastBarcodeErrorCode: true,
          barcodeRetryCount: true,
          barcodeRetryBlockedReason: true,
        },
      });
    },

    async loadProviderConfig(storeId, providerConfigId) {
      return prisma.shippingProviderConfig.findFirst({
        where: { id: providerConfigId, storeId },
        include: { credentials: true },
      });
    },

    async applyBarcodeSuccess(input) {
      await prisma.$transaction(async (tx) => {
        await tx.shipment.update({
          where: { id: input.shipmentId },
          data: {
            status: input.status,
            ...(input.status === "LABEL_CREATED"
              ? {
                  externalShipmentId: input.externalShipmentId,
                  externalInvoiceId: input.externalInvoiceId,
                  trackingNumber: input.trackingNumber,
                }
              : {}),
            barcodeJsonSafe: input.barcodeJsonSafe,
            barcodeLastAttemptAt: input.at,
            ...BARCODE_RETRY_RESET,
          },
        });
        await tx.shipmentEvent.create({
          data: {
            storeId: input.storeId,
            shipmentId: input.shipmentId,
            provider: input.provider,
            eventType: input.eventType,
            statusText: input.eventStatusText,
            rawSafeJson: input.barcodeJsonSafe,
          },
        });
      });
    },

    async recordBarcodeFailure(input) {
      await prisma.$transaction(async (tx) => {
        await tx.shipment.update({
          where: { id: input.shipmentId },
          data: {
            lastBarcodeErrorCode: input.errorCode,
            barcodeRetryCount: input.retryCount,
            barcodeNextRetryAt: input.nextRetryAt,
            barcodeLastAttemptAt: input.at,
            barcodeRetryBlockedReason: input.blockedReason,
          },
        });
        if (input.event) {
          await tx.shipmentEvent.create({
            data: {
              storeId: input.storeId,
              shipmentId: input.shipmentId,
              provider: input.provider,
              eventType: "BARCODE_FAILED",
              statusText: input.event.statusText,
              rawSafeJson: input.event.rawSafeJson,
            },
          });
        }
      });
    },
  };
}
