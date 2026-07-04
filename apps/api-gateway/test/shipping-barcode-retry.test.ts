import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@commerce-os/config";
import type { ShipmentStatus, ShippingProviderType } from "@prisma/client";
import { ShippingConfigError } from "../src/shipping/errors.js";
import type { ShippingAdapterRegistry } from "../src/shipping/adapters/registry.js";
import type { ConfigWithCredentials } from "../src/shipping/context.js";
import {
  BARCODE_ERROR_NETWORK,
  BARCODE_ERROR_PROVIDER,
  BARCODE_RETRY_UNBLOCK,
  classifyBarcodeErrorClass,
  classifyCapturedBarcodeError,
  classifyThrownBarcodeError,
  computeBarcodeBackoffMs,
  createBarcodeRetryService,
  type BarcodeEligibleQuery,
  type BarcodeFailureInput,
  type BarcodeRetryPersistence,
  type BarcodeShipmentRecord,
  type BarcodeSuccessInput,
} from "../src/shipping/barcode-service.js";
import { startBarcodeRetryWorker } from "../src/shipping/barcode-retry-worker.js";
import type { ShippingBarcodeResult, ShippingProviderAdapter } from "../src/shipping/types.js";

/**
 * TODO-123 — Barkod retry/backoff cekirdegi testleri. In-memory persistence fake'i prisma
 * secim semantigini uygular (status/provider/blok/hata/backoff/attempt filtreleri); fake
 * adapter barkod yaniti/hatasi doner. Kapsam: retry sinif­landirmasi, backoff, uygun secim,
 * metadata gecisi/reset, event idempotency, worker enable/overlap/batch/izolasyon/skip.
 */

const NOW = new Date("2026-07-04T12:00:00.000Z");
const MIN = 60 * 1000;

const BASE_CONFIG = {
  SHIPPING_ENCRYPTION_KEY: "a".repeat(64),
  SHIPPING_SANDBOX_HTTP_ENABLED: false,
  DHL_ECOMMERCE_ALLOW_RECIPIENT_CREATE: false,
  DHL_ECOMMERCE_ALLOW_ORDER_CREATE: false,
  DHL_ECOMMERCE_ALLOW_BARCODE_CREATE: false,
  DHL_ECOMMERCE_ALLOW_CANCEL: false,
  GELIVER_ALLOW_LABEL_PURCHASE: false,
  BARCODE_RETRY_ENABLED: true,
  BARCODE_RETRY_INTERVAL_SECONDS: 300,
  BARCODE_RETRY_BATCH_SIZE: 10,
  BARCODE_RETRY_STALE_AFTER_MINUTES: 15,
  BARCODE_RETRY_MAX_ATTEMPTS: 5,
} as unknown as AppConfig;

interface FakeShipment extends BarcodeShipmentRecord {
  barcodeNextRetryAt: Date | null;
  barcodeLastAttemptAt: Date | null;
}

interface FakeEvent {
  shipmentId: string;
  eventType: string;
  statusText: string | null;
}

function makeShipment(overrides: Partial<FakeShipment> = {}): FakeShipment {
  return {
    id: "shp_1",
    storeId: "store_1",
    providerConfigId: "spc_dhl",
    provider: "DHL_ECOMMERCE",
    referenceId: "OS-000041",
    status: "ORDER_CREATED",
    packagingType: null,
    pieceCount: 1,
    totalKg: 1,
    totalDesi: 1,
    externalShipmentId: null,
    externalInvoiceId: null,
    trackingNumber: null,
    lastBarcodeErrorCode: null,
    barcodeRetryCount: 0,
    barcodeRetryBlockedReason: null,
    barcodeNextRetryAt: null,
    barcodeLastAttemptAt: null,
    ...overrides,
  };
}

function enabledConfig(provider: ShippingProviderType = "DHL_ECOMMERCE"): ConfigWithCredentials {
  return { id: "spc_dhl", storeId: "store_1", provider, status: "ENABLED", credentials: [] } as unknown as ConfigWithCredentials;
}

/** In-memory persistence (prisma secim semantigiyle AYNI filtre). */
function createFakePersistence(shipments: FakeShipment[], cfg: ConfigWithCredentials | null) {
  const events: FakeEvent[] = [];
  const byId = new Map(shipments.map((s) => [s.id, s]));

  const persistence: BarcodeRetryPersistence = {
    async findEligibleBarcodeShipments(query: BarcodeEligibleQuery) {
      const selected = shipments
        .filter((s) => query.statuses.includes(s.status))
        .filter((s) => query.providers.includes(s.provider))
        .filter((s) => s.barcodeRetryBlockedReason === null)
        .filter((s) => s.lastBarcodeErrorCode !== null)
        .filter((s) => (query.maxAttempts == null ? true : s.barcodeRetryCount < query.maxAttempts))
        .filter((s) => s.barcodeNextRetryAt !== null && (query.now == null || s.barcodeNextRetryAt <= query.now))
        .sort((a, b) => (a.barcodeNextRetryAt!.getTime() - b.barcodeNextRetryAt!.getTime()));
      return selected.slice(0, query.batchSize).map((s) => ({ ...s }));
    },
    async loadProviderConfig() {
      return cfg;
    },
    async applyBarcodeSuccess(input: BarcodeSuccessInput) {
      const s = byId.get(input.shipmentId)!;
      s.status = input.status;
      s.lastBarcodeErrorCode = null;
      s.barcodeRetryCount = 0;
      s.barcodeNextRetryAt = null;
      s.barcodeRetryBlockedReason = null;
      s.barcodeLastAttemptAt = input.at;
      if (input.status === "LABEL_CREATED") s.externalShipmentId = input.externalShipmentId;
      events.push({ shipmentId: input.shipmentId, eventType: input.eventType, statusText: input.eventStatusText });
    },
    async recordBarcodeFailure(input: BarcodeFailureInput) {
      const s = byId.get(input.shipmentId)!;
      s.lastBarcodeErrorCode = input.errorCode;
      s.barcodeRetryCount = input.retryCount;
      s.barcodeNextRetryAt = input.nextRetryAt;
      s.barcodeRetryBlockedReason = input.blockedReason;
      s.barcodeLastAttemptAt = input.at;
      if (input.event) events.push({ shipmentId: input.shipmentId, eventType: "BARCODE_FAILED", statusText: input.event.statusText });
    },
  };
  return { persistence, events, byId };
}

/** Fake adapter: createBarcodeOrLabel sirali yanit/hata kuyrugundan doner. */
function createFakeRegistry(
  responder: () => ShippingBarcodeResult | Promise<ShippingBarcodeResult>,
): { registry: ShippingAdapterRegistry; calls: () => number } {
  let calls = 0;
  const adapter = {
    async createBarcodeOrLabel() {
      calls += 1;
      return responder();
    },
  } as unknown as ShippingProviderAdapter;
  return { registry: { get: () => adapter } as unknown as ShippingAdapterRegistry, calls: () => calls };
}

function okResult(): ShippingBarcodeResult {
  return {
    referenceId: "OS-000041",
    externalShipmentId: "SHIP-9",
    externalInvoiceId: "INV-9",
    barcodes: [{ pieceNumber: 1, barcode: "BC1", labelPresent: true }],
    providerReturnedEmptyPayload: false,
    providerErrorMessage: null,
    providerErrorCode: null,
  };
}

function errorResult(message: string, code: string | null): ShippingBarcodeResult {
  return {
    referenceId: "OS-000041",
    externalShipmentId: null,
    externalInvoiceId: null,
    barcodes: [],
    providerReturnedEmptyPayload: false,
    providerErrorMessage: message,
    providerErrorCode: code,
  };
}

function buildService(shipments: FakeShipment[], responder: () => ShippingBarcodeResult | Promise<ShippingBarcodeResult>, cfg: ConfigWithCredentials | null = enabledConfig()) {
  const { persistence, events, byId } = createFakePersistence(shipments, cfg);
  const { registry, calls } = createFakeRegistry(responder);
  const service = createBarcodeRetryService({ config: BASE_CONFIG, registry, persistence, now: () => NOW });
  return { service, events, byId, calls, persistence };
}

/* ───────────────────────── Sinif­landirma (saf) ───────────────────────── */

describe("TODO-123 — barkod retry sinif­landirmasi", () => {
  it("DESTINATION_BRANCH_NOT_FOUND → DATA_FIX", () => {
    expect(classifyBarcodeErrorClass("DESTINATION_BRANCH_NOT_FOUND")).toBe("DATA_FIX");
  });
  it("ADDRESS_DISTRICT_CODE_REQUIRED / CBS_CODE_INVALID / RECIPIENT_EMAIL_* → DATA_FIX", () => {
    expect(classifyBarcodeErrorClass("ADDRESS_DISTRICT_CODE_REQUIRED")).toBe("DATA_FIX");
    expect(classifyBarcodeErrorClass("CBS_CODE_INVALID")).toBe("DATA_FIX");
    expect(classifyBarcodeErrorClass("RECIPIENT_EMAIL_REQUIRED")).toBe("DATA_FIX");
    expect(classifyBarcodeErrorClass("RECIPIENT_EMAIL_INVALID")).toBe("DATA_FIX");
  });
  it("AUTH_FAILED / SHIPPING_HTTP_DISABLED / BARCODE_CREATE_DISABLED → TERMINAL", () => {
    expect(classifyBarcodeErrorClass("AUTH_FAILED")).toBe("TERMINAL");
    expect(classifyBarcodeErrorClass("SHIPPING_HTTP_DISABLED")).toBe("TERMINAL");
    expect(classifyBarcodeErrorClass("BARCODE_CREATE_DISABLED")).toBe("TERMINAL");
  });
  it("bilinmeyen/generic kod → RETRYABLE (uydurma yok)", () => {
    expect(classifyBarcodeErrorClass(BARCODE_ERROR_PROVIDER)).toBe("RETRYABLE");
    expect(classifyBarcodeErrorClass("SOMETHING_NEW")).toBe("RETRYABLE");
  });
  it("yakalanan MNG 20001 → DESTINATION (DATA_FIX); tanınmayan → generic RETRYABLE", () => {
    expect(classifyCapturedBarcodeError("20001", "VARIŞ ŞUBESİ BULUNAMADI")).toEqual({ code: "DESTINATION_BRANCH_NOT_FOUND", retryClass: "DATA_FIX" });
    expect(classifyCapturedBarcodeError(null, "Sağlayıcı hatası (HTTP 500)")).toEqual({ code: BARCODE_ERROR_PROVIDER, retryClass: "RETRYABLE" });
  });
  it("firlatilan timeout → RETRYABLE; auth → TERMINAL; network → RETRYABLE", () => {
    expect(classifyThrownBarcodeError(new ShippingConfigError("SHIPPING_HTTP_TIMEOUT"))).toEqual({ code: "SHIPPING_HTTP_TIMEOUT", retryClass: "RETRYABLE" });
    expect(classifyThrownBarcodeError(new ShippingConfigError("AUTH_FAILED"))).toEqual({ code: "AUTH_FAILED", retryClass: "TERMINAL" });
    expect(classifyThrownBarcodeError(new Error("ECONNRESET"))).toEqual({ code: BARCODE_ERROR_NETWORK, retryClass: "RETRYABLE" });
  });
  it("ussel backoff 6 saatle sinirli (cap)", () => {
    const stale = 15 * MIN;
    expect(computeBarcodeBackoffMs(stale, 1)).toBe(15 * MIN);
    expect(computeBarcodeBackoffMs(stale, 2)).toBe(30 * MIN);
    expect(computeBarcodeBackoffMs(stale, 100)).toBe(6 * 60 * MIN); // cap
  });
});

/* ───────────────────────── attemptBarcode metadata gecisleri ───────────────────────── */

describe("TODO-123 — attemptBarcode metadata/event", () => {
  it("transient 5xx → RETRY_SCHEDULED, backoff yazilir, sayaç artar", async () => {
    const s = makeShipment();
    const { service, byId, events } = buildService([s], () => errorResult("Sağlayıcı hatası (HTTP 500)", null));
    const out = await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" });
    expect(out).toEqual({ kind: "failed", errorCode: BARCODE_ERROR_PROVIDER, retryClass: "RETRYABLE", blockedReason: null });
    const after = byId.get("shp_1")!;
    expect(after.barcodeRetryCount).toBe(1);
    expect(after.barcodeRetryBlockedReason).toBeNull();
    expect(after.barcodeNextRetryAt).toEqual(new Date(NOW.getTime() + 15 * MIN));
    expect(after.status).toBe("ORDER_CREATED"); // durum ILERLEMEZ
    expect(events.filter((e) => e.eventType === "BARCODE_FAILED")).toHaveLength(1);
  });

  it("network hata (worker) → RETRY_SCHEDULED (firlatma yakalanir)", async () => {
    const s = makeShipment();
    const { service, byId } = buildService([s], () => {
      throw new Error("socket hang up");
    });
    const out = await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" });
    expect(out).toMatchObject({ kind: "failed", errorCode: BARCODE_ERROR_NETWORK, retryClass: "RETRYABLE" });
    expect(byId.get("shp_1")!.barcodeNextRetryAt).not.toBeNull();
  });

  it("firlatilan hata (manuel) → YENIDEN firlatir ama metadata yazar", async () => {
    const s = makeShipment();
    const { service, byId } = buildService([s], () => {
      throw new ShippingConfigError("SHIPPING_HTTP_TIMEOUT");
    });
    await expect(service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "manual" })).rejects.toThrow(ShippingConfigError);
    const after = byId.get("shp_1")!;
    expect(after.lastBarcodeErrorCode).toBe("SHIPPING_HTTP_TIMEOUT");
    expect(after.barcodeRetryCount).toBe(1);
  });

  it("DESTINATION_BRANCH_NOT_FOUND → DATA_FIX blok, backoff YOK, sayaç artmaz", async () => {
    const s = makeShipment();
    const { service, byId } = buildService([s], () => errorResult("VARIŞ ŞUBESİ BULUNAMADI", "20001"));
    const out = await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" });
    expect(out).toMatchObject({ kind: "failed", errorCode: "DESTINATION_BRANCH_NOT_FOUND", retryClass: "DATA_FIX", blockedReason: "DATA_FIX" });
    const after = byId.get("shp_1")!;
    expect(after.barcodeRetryBlockedReason).toBe("DATA_FIX");
    expect(after.barcodeNextRetryAt).toBeNull();
    expect(after.barcodeRetryCount).toBe(0);
  });

  it("max attempts → MAX_ATTEMPTS blok (backoff yok)", async () => {
    const s = makeShipment({ barcodeRetryCount: 4, lastBarcodeErrorCode: BARCODE_ERROR_PROVIDER }); // 4 → 5 = max
    const { service, byId } = buildService([s], () => errorResult("HTTP 503", null));
    const out = await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" });
    expect(out).toMatchObject({ blockedReason: "MAX_ATTEMPTS" });
    const after = byId.get("shp_1")!;
    expect(after.barcodeRetryCount).toBe(5);
    expect(after.barcodeNextRetryAt).toBeNull();
    expect(after.barcodeRetryBlockedReason).toBe("MAX_ATTEMPTS");
  });

  it("başarı → LABEL_CREATED + tüm retry metadata sıfırlanır", async () => {
    const s = makeShipment({ barcodeRetryCount: 3, lastBarcodeErrorCode: BARCODE_ERROR_PROVIDER, barcodeNextRetryAt: new Date(NOW.getTime() - MIN) });
    const { service, byId, events } = buildService([s], okResult);
    const out = await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" });
    expect(out).toEqual({ kind: "label" });
    const after = byId.get("shp_1")!;
    expect(after.status).toBe("LABEL_CREATED");
    expect(after.barcodeRetryCount).toBe(0);
    expect(after.lastBarcodeErrorCode).toBeNull();
    expect(after.barcodeRetryBlockedReason).toBeNull();
    expect(after.barcodeNextRetryAt).toBeNull();
    expect(events.some((e) => e.eventType === "BARCODE_CREATED")).toBe(true);
  });

  it("boş 200 → LABEL_PENDING + retry metadata sıfırlanır (domain hatası değil)", async () => {
    const s = makeShipment({ lastBarcodeErrorCode: BARCODE_ERROR_PROVIDER, barcodeRetryCount: 2 });
    const { service, byId } = buildService([s], () => ({
      referenceId: "OS-000041",
      externalShipmentId: null,
      externalInvoiceId: null,
      barcodes: [],
      providerReturnedEmptyPayload: true,
      providerErrorMessage: null,
      providerErrorCode: null,
    }));
    const out = await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" });
    expect(out).toEqual({ kind: "pending" });
    const after = byId.get("shp_1")!;
    expect(after.status).toBe("LABEL_PENDING");
    expect(after.barcodeRetryCount).toBe(0);
    expect(after.lastBarcodeErrorCode).toBeNull();
  });

  it("aynı hata kodu tekrar → BARCODE_FAILED event SPAM edilmez", async () => {
    const s = makeShipment();
    const { service, events } = buildService([s], () => errorResult("HTTP 500", null));
    await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" }); // 1. hata → event
    await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" }); // aynı kod → event YOK
    expect(events.filter((e) => e.eventType === "BARCODE_FAILED")).toHaveLength(1);
  });

  it("hata kodu değişince yeni BARCODE_FAILED yazılır", async () => {
    const s = makeShipment();
    let first = true;
    const { service, events } = buildService([s], () => {
      const r = first ? errorResult("HTTP 500", null) : errorResult("VARIŞ ŞUBESİ BULUNAMADI", "20001");
      first = false;
      return r;
    });
    await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" });
    await service.attemptBarcode(s, enabledConfig(), { explicitConfirm: true, trigger: "worker" });
    expect(events.filter((e) => e.eventType === "BARCODE_FAILED")).toHaveLength(2);
  });

  it("adres onarımı reset sabiti: retry blogu + sayaç/backoff sıfırlanır", () => {
    expect(BARCODE_RETRY_UNBLOCK).toEqual({
      lastBarcodeErrorCode: null,
      barcodeRetryCount: 0,
      barcodeNextRetryAt: null,
      barcodeRetryBlockedReason: null,
    });
  });
});

/* ───────────────────────── retryEligibleBarcodes (secim + batch) ───────────────────────── */

describe("TODO-123 — retryEligibleBarcodes secim", () => {
  const retryable = { lastBarcodeErrorCode: BARCODE_ERROR_PROVIDER, barcodeNextRetryAt: new Date(NOW.getTime() - MIN) };

  it("ORDER_CREATED + retryable + backoff dolmuş → SEÇİLİR ve denenir", async () => {
    const s = makeShipment({ ...retryable });
    const { service, calls } = buildService([s], okResult);
    const summary = await service.retryEligibleBarcodes();
    expect(summary.scanned).toBe(1);
    expect(summary.created).toBe(1);
    expect(calls()).toBe(1);
  });

  it("DATA_FIX bloklu (DESTINATION) → SEÇİLMEZ", async () => {
    const s = makeShipment({ lastBarcodeErrorCode: "DESTINATION_BRANCH_NOT_FOUND", barcodeRetryBlockedReason: "DATA_FIX", barcodeNextRetryAt: null });
    const { service, calls } = buildService([s], okResult);
    const summary = await service.retryEligibleBarcodes();
    expect(summary.scanned).toBe(0);
    expect(calls()).toBe(0);
  });

  it("terminal/kilitli status (LABEL_CREATED, DELIVERED, CANCELLED) → SEÇİLMEZ", async () => {
    const locked: ShipmentStatus[] = ["LABEL_CREATED", "IN_TRANSIT", "DELIVERED", "CANCELLED", "RETURNED"];
    const ships = locked.map((status, i) => makeShipment({ id: `s${i}`, status, ...retryable }));
    const { service } = buildService(ships, okResult);
    const summary = await service.retryEligibleBarcodes();
    expect(summary.scanned).toBe(0);
  });

  it("backoff dolmadıysa (nextRetryAt gelecekte) → SEÇİLMEZ", async () => {
    const s = makeShipment({ lastBarcodeErrorCode: BARCODE_ERROR_PROVIDER, barcodeNextRetryAt: new Date(NOW.getTime() + MIN) });
    const { service } = buildService([s], okResult);
    expect((await service.retryEligibleBarcodes()).scanned).toBe(0);
  });

  it("retry count max'a ulaşan → SEÇİLMEZ", async () => {
    const s = makeShipment({ ...retryable, barcodeRetryCount: 5 });
    const { service } = buildService([s], okResult);
    expect((await service.retryEligibleBarcodes()).scanned).toBe(0);
  });

  it("batch size sınırı uygulanır", async () => {
    const ships = Array.from({ length: 25 }, (_, i) => makeShipment({ id: `s${i}`, ...retryable, barcodeNextRetryAt: new Date(NOW.getTime() - (i + 1) * MIN) }));
    const { service, calls } = buildService(ships, okResult);
    const summary = await service.retryEligibleBarcodes();
    expect(summary.scanned).toBe(10); // BARCODE_RETRY_BATCH_SIZE
    expect(calls()).toBe(10);
  });

  it("bir gönderi hatası batch'i durdurmaz (izolasyon)", async () => {
    const ships = [makeShipment({ id: "a", ...retryable }), makeShipment({ id: "b", ...retryable })];
    let n = 0;
    const { service } = buildService(ships, () => {
      n += 1;
      if (n === 1) throw new Error("boom"); // ilk denemede beklenmedik hata
      return okResult();
    });
    const summary = await service.retryEligibleBarcodes();
    expect(summary.scanned).toBe(2); // ikisi de işlendi
  });

  it("disabled sağlayıcı → SKIPPED_DISABLED", async () => {
    const s = makeShipment({ ...retryable });
    const disabled = { ...enabledConfig(), status: "DISABLED" } as unknown as ConfigWithCredentials;
    const { service } = buildService([s], okResult, disabled);
    const summary = await service.retryEligibleBarcodes();
    expect(summary.skipped).toBe(1);
    expect(summary.results[0]!.outcome).toBe("SKIPPED_DISABLED");
  });

  it("desteklenmeyen sağlayıcı → SKIPPED_UNSUPPORTED", async () => {
    const s = makeShipment({ ...retryable, provider: "DHL_ECOMMERCE" });
    const geliver = { ...enabledConfig("GELIVER") } as unknown as ConfigWithCredentials;
    const { service } = buildService([s], okResult, geliver);
    const summary = await service.retryEligibleBarcodes();
    expect(summary.results[0]!.outcome).toBe("SKIPPED_UNSUPPORTED");
  });
});

/* ───────────────────────── Worker davranisi ───────────────────────── */

describe("TODO-123 — barcode retry worker", () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn() } as never;

  it("BARCODE_RETRY_ENABLED=false → no-op (dongu kurulmaz)", async () => {
    const service = { retryEligibleBarcodes: vi.fn(), attemptBarcode: vi.fn() };
    const handle = startBarcodeRetryWorker({
      config: { ...BASE_CONFIG, BARCODE_RETRY_ENABLED: false } as AppConfig,
      logger,
      service: service as never,
    });
    expect(handle.enabled).toBe(false);
    expect(await handle.runOnce()).toBeNull();
    expect(service.retryEligibleBarcodes).not.toHaveBeenCalled();
    await handle.stop();
  });

  it("enabled → runOnce cekirdegi cagirir; overlap korumasi", async () => {
    let inflight = 0;
    let maxInflight = 0;
    const service = {
      attemptBarcode: vi.fn(),
      retryEligibleBarcodes: vi.fn(async () => {
        inflight += 1;
        maxInflight = Math.max(maxInflight, inflight);
        await new Promise((r) => setTimeout(r, 20));
        inflight -= 1;
        return { scanned: 0, created: 0, scheduled: 0, blocked: 0, skipped: 0, results: [] };
      }),
    };
    const handle = startBarcodeRetryWorker({ config: BASE_CONFIG, logger, service: service as never });
    await Promise.all([handle.runOnce(), handle.runOnce()]); // ust uste
    expect(maxInflight).toBe(1); // overlap YOK
    await handle.stop();
  });
});
