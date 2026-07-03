import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "@commerce-os/config";
import { envSchema } from "@commerce-os/config";
import type { ShipmentStatus, ShippingProviderType } from "@prisma/client";
import { ShippingConfigError } from "../src/shipping/errors.js";
import type { ShippingAdapterRegistry } from "../src/shipping/adapters/registry.js";
import type { ConfigWithCredentials } from "../src/shipping/context.js";
import type {
  ShipmentSyncPersistence,
  SyncShipmentRecord,
  SyncSuccessInput,
} from "../src/shipping/sync-service.js";
import { createShipmentSyncService } from "../src/shipping/sync-service.js";
import { startShipmentSyncWorker } from "../src/shipping/sync-worker.js";
import type {
  ShippingProviderAdapter,
  ShippingShipmentStatusResult,
  ShippingTrackingEventResult,
} from "../src/shipping/types.js";

/**
 * TODO-129 — Zamanlanmis shipment sync cekirdegi testleri. In-memory persistence fake'i
 * prisma implementasyonuyla AYNI secim semantigini uygular (statuses/stale/backoff/
 * attempt filtreleri); adapter'lar sahte yanit doner. Kapsam: uygun gonderi secimi,
 * durum ilerletme/regresyon korumasi, event idempotency, hata izolasyonu, batch limiti,
 * provider-agnostic dispatch, unsupported/disabled skip ve env parsing guvenligi.
 */

const NOW = new Date("2026-07-04T12:00:00.000Z");
const MIN = 60 * 1000;

const BASE_CONFIG = {
  SHIPPING_ENCRYPTION_KEY: "a".repeat(64),
  DHL_ECOMMERCE_ALLOW_RECIPIENT_CREATE: false,
  DHL_ECOMMERCE_ALLOW_ORDER_CREATE: false,
  DHL_ECOMMERCE_ALLOW_BARCODE_CREATE: false,
  DHL_ECOMMERCE_ALLOW_CANCEL: false,
  GELIVER_ALLOW_LABEL_PURCHASE: false,
  SHIPMENT_SYNC_ENABLED: true,
  SHIPMENT_SYNC_INTERVAL_SECONDS: 300,
  SHIPMENT_SYNC_BATCH_SIZE: 25,
  SHIPMENT_SYNC_STALE_AFTER_MINUTES: 15,
  SHIPMENT_SYNC_MAX_ATTEMPTS: 10,
} as unknown as AppConfig;

interface FakeShipment extends SyncShipmentRecord {
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  lastSyncErrorCode: string | null;
}

interface FakeEvent {
  shipmentId: string;
  eventType: "STATUS_CHANGED" | "TRACKING_UPDATED";
  statusCode: number | null;
  statusText: string | null;
  location: string | null;
  occurredAt: Date | null;
}

function makeShipment(overrides: Partial<FakeShipment> = {}): FakeShipment {
  return {
    id: "shp_1",
    storeId: "store_1",
    providerConfigId: "spc_dhl",
    provider: "DHL_ECOMMERCE",
    referenceId: "OS-000041",
    externalShipmentId: "ext_41",
    trackingNumber: "TRACK41",
    trackingUrl: null,
    shipmentStatusCode: null,
    status: "ORDER_CREATED",
    syncAttempts: 0,
    lastSyncAt: null,
    nextSyncAt: null,
    lastSyncErrorCode: null,
    ...overrides,
  };
}

function makeCfg(overrides: Partial<ConfigWithCredentials> = {}): ConfigWithCredentials {
  return {
    id: "spc_dhl",
    storeId: "store_1",
    provider: "DHL_ECOMMERCE",
    mode: "TEST",
    status: "ENABLED",
    displayName: "DHL eCommerce",
    allowRecipientCreate: false,
    allowOrderCreate: false,
    allowBarcodeCreate: false,
    allowLabelPurchase: false,
    credentials: [],
    ...overrides,
  } as unknown as ConfigWithCredentials;
}

interface FakeState {
  shipments: FakeShipment[];
  events: FakeEvent[];
  configs: Map<string, ConfigWithCredentials>;
}

/** Prisma persistence ile AYNI secim/filtre semantigi (in-memory). */
function makePersistence(state: FakeState): ShipmentSyncPersistence {
  return {
    async findEligibleShipments(query) {
      const items = state.shipments.filter((s) => {
        if (query.storeId && s.storeId !== query.storeId) return false;
        if (!query.statuses.includes(s.status)) return false;
        if (query.maxAttempts != null && s.syncAttempts >= query.maxAttempts) return false;
        if (query.now && s.nextSyncAt && s.nextSyncAt.getTime() > query.now.getTime()) return false;
        if (query.staleBefore && s.lastSyncAt && s.lastSyncAt.getTime() > query.staleBefore.getTime()) {
          return false;
        }
        return true;
      });
      items.sort((a, b) => (a.lastSyncAt?.getTime() ?? -1) - (b.lastSyncAt?.getTime() ?? -1));
      return items.slice(0, query.batchSize).map((s) => ({ ...s }));
    },
    async loadProviderConfig(storeId, providerConfigId) {
      return state.configs.get(`${storeId}:${providerConfigId}`) ?? null;
    },
    async getLastStatusEvent(shipmentId) {
      const found = [...state.events]
        .reverse()
        .find((e) => e.shipmentId === shipmentId && e.eventType === "STATUS_CHANGED");
      return found ? { statusCode: found.statusCode, statusText: found.statusText } : null;
    },
    async listTrackingEvents(shipmentId) {
      return state.events
        .filter((e) => e.shipmentId === shipmentId && e.eventType === "TRACKING_UPDATED")
        .map((e) => ({ statusText: e.statusText, location: e.location, occurredAt: e.occurredAt }));
    },
    async applySyncSuccess(input: SyncSuccessInput) {
      const s = state.shipments.find((x) => x.id === input.shipmentId);
      if (!s) throw new Error("shipment yok");
      s.status = input.nextStatus;
      s.shipmentStatusCode = input.shipmentStatusCode;
      s.trackingUrl = input.trackingUrl;
      s.trackingNumber = input.trackingNumber;
      s.lastSyncAt = input.syncedAt;
      s.nextSyncAt = null;
      s.syncAttempts = 0;
      s.lastSyncErrorCode = null;
      if (input.statusEvent) {
        state.events.push({
          shipmentId: input.shipmentId,
          eventType: "STATUS_CHANGED",
          statusCode: input.statusEvent.statusCode,
          statusText: input.statusEvent.statusText,
          location: null,
          occurredAt: input.statusEvent.occurredAt,
        });
      }
      for (const ev of input.trackingEvents) {
        state.events.push({
          shipmentId: input.shipmentId,
          eventType: "TRACKING_UPDATED",
          statusCode: ev.statusCode,
          statusText: ev.statusText,
          location: ev.location,
          occurredAt: ev.occurredAt,
        });
      }
    },
    async recordSyncFailure(input) {
      const s = state.shipments.find((x) => x.id === input.shipmentId);
      if (!s) throw new Error("shipment yok");
      s.lastSyncAt = input.syncedAt;
      s.nextSyncAt = input.nextSyncAt;
      s.syncAttempts = input.syncAttempts;
      s.lastSyncErrorCode = input.errorCode;
    },
  };
}

type ProviderBehavior =
  | { status: ShippingShipmentStatusResult; track?: ShippingTrackingEventResult[] }
  | { error: ShippingConfigError };

function statusResult(overrides: Partial<ShippingShipmentStatusResult> = {}): ShippingShipmentStatusResult {
  return {
    referenceId: "OS-000041",
    externalShipmentId: "ext_41",
    statusCode: 2,
    statusText: "Yolda",
    isDelivered: false,
    trackingUrl: "https://takip.example/41",
    ...overrides,
  };
}

/** Yalniz sync yolunda kullanilan metodlari uygulayan sahte adapter registry'si. */
function makeRegistry(behaviors: Partial<Record<ShippingProviderType, ProviderBehavior>>) {
  const requested: ShippingProviderType[] = [];
  const registry: ShippingAdapterRegistry = {
    get(provider) {
      requested.push(provider);
      const behavior = behaviors[provider];
      const adapter = {
        provider,
        async getShipmentStatus() {
          if (!behavior) throw new Error(`beklenmeyen provider cagrisi: ${provider}`);
          if ("error" in behavior) throw behavior.error;
          return behavior.status;
        },
        async trackShipment() {
          if (!behavior || "error" in behavior) return [];
          return behavior.track ?? [];
        },
      } as unknown as ShippingProviderAdapter;
      return adapter;
    },
  };
  return { registry, requested };
}

function makeService(opts: {
  state: FakeState;
  behaviors: Partial<Record<ShippingProviderType, ProviderBehavior>>;
  config?: Partial<AppConfig>;
  now?: () => Date;
}) {
  const { registry, requested } = makeRegistry(opts.behaviors);
  const service = createShipmentSyncService({
    config: { ...BASE_CONFIG, ...(opts.config ?? {}) } as AppConfig,
    registry,
    persistence: makePersistence(opts.state),
    now: opts.now ?? (() => NOW),
  });
  return { service, requested };
}

function baseState(shipments: FakeShipment[]): FakeState {
  const configs = new Map<string, ConfigWithCredentials>();
  configs.set("store_1:spc_dhl", makeCfg());
  return { shipments, events: [], configs };
}

describe("shipment sync — uygun gonderi secimi", () => {
  it("yalniz aktif (terminal olmayan) durumlar secilir; DELIVERED/CANCELLED atlanir", async () => {
    const state = baseState([
      makeShipment({ id: "s_active", status: "ORDER_CREATED" }),
      makeShipment({ id: "s_delivered", status: "DELIVERED", referenceId: "r2" }),
      makeShipment({ id: "s_cancelled", status: "CANCELLED", referenceId: "r3" }),
      makeShipment({ id: "s_draft", status: "DRAFT", referenceId: "r4" }),
    ]);
    const { service } = makeService({ state, behaviors: { DHL_ECOMMERCE: { status: statusResult() } } });
    const summary = await service.syncEligibleShipments();
    expect(summary.scanned).toBe(1);
    expect(summary.results[0]?.shipmentId).toBe("s_active");
  });

  it("yakin zamanda senkronlanan gonderi (stale-after icinde) secilmez", async () => {
    const state = baseState([
      makeShipment({ id: "s_fresh", lastSyncAt: new Date(NOW.getTime() - 5 * MIN) }),
      makeShipment({ id: "s_stale", referenceId: "r2", lastSyncAt: new Date(NOW.getTime() - 30 * MIN) }),
    ]);
    const { service } = makeService({ state, behaviors: { DHL_ECOMMERCE: { status: statusResult() } } });
    const summary = await service.syncEligibleShipments();
    expect(summary.results.map((r) => r.shipmentId)).toEqual(["s_stale"]);
  });

  it("backoff (nextSyncAt gelecekte) ve attempt esigi asilan gonderi worker'da secilmez", async () => {
    const state = baseState([
      makeShipment({ id: "s_backoff", nextSyncAt: new Date(NOW.getTime() + 10 * MIN) }),
      makeShipment({ id: "s_maxed", referenceId: "r2", syncAttempts: 10 }),
      makeShipment({ id: "s_ok", referenceId: "r3" }),
    ]);
    const { service } = makeService({ state, behaviors: { DHL_ECOMMERCE: { status: statusResult() } } });
    const summary = await service.syncEligibleShipments();
    expect(summary.results.map((r) => r.shipmentId)).toEqual(["s_ok"]);
  });

  it("manuel (force) mod stale/backoff/attempt filtrelerini atlar ve store scoped calisir", async () => {
    const state = baseState([
      makeShipment({ id: "s_fresh", lastSyncAt: new Date(NOW.getTime() - 1 * MIN), syncAttempts: 99 }),
      makeShipment({ id: "s_other_store", storeId: "store_2", referenceId: "r2" }),
    ]);
    state.configs.set("store_2:spc_dhl", makeCfg({ storeId: "store_2" }));
    const { service } = makeService({ state, behaviors: { DHL_ECOMMERCE: { status: statusResult() } } });
    const summary = await service.syncEligibleShipments({ storeId: "store_1", force: true });
    expect(summary.results.map((r) => r.shipmentId)).toEqual(["s_fresh"]);
    expect(summary.synced).toBe(1);
  });

  it("batch limiti asilmaz", async () => {
    const state = baseState(
      Array.from({ length: 5 }, (_, i) => makeShipment({ id: `s_${i}`, referenceId: `r${i}` })),
    );
    const { service } = makeService({ state, behaviors: { DHL_ECOMMERCE: { status: statusResult() } } });
    const summary = await service.syncEligibleShipments({ batchSize: 2 });
    expect(summary.scanned).toBe(2);
  });
});

describe("shipment sync — durum ilerletme kurallari", () => {
  async function runSingle(status: ShipmentStatus, provider: ShippingShipmentStatusResult) {
    const state = baseState([makeShipment({ status })]);
    const { service } = makeService({ state, behaviors: { DHL_ECOMMERCE: { status: provider } } });
    const summary = await service.syncEligibleShipments();
    return { state, summary };
  }

  it("ORDER_CREATED yalniz saglayici kanitiyla (kod 2) IN_TRANSIT'e ilerler", async () => {
    const { state } = await runSingle("ORDER_CREATED", statusResult({ statusCode: 2 }));
    expect(state.shipments[0]?.status).toBe("IN_TRANSIT");
  });

  it("LABEL_CREATED, saglayici hala 1 diyorsa ilerlemez", async () => {
    const { state, summary } = await runSingle("LABEL_CREATED", statusResult({ statusCode: 1, statusText: "Hazır" }));
    expect(state.shipments[0]?.status).toBe("LABEL_CREATED");
    expect(summary.results[0]?.statusChanged).toBe(false);
  });

  it("IN_TRANSIT → OUT_FOR_DELIVERY (kod 4)", async () => {
    const { state } = await runSingle("IN_TRANSIT", statusResult({ statusCode: 4, statusText: "Dağıtımda" }));
    expect(state.shipments[0]?.status).toBe("OUT_FOR_DELIVERY");
  });

  it("OUT_FOR_DELIVERY → DELIVERED (kod 5 / isDelivered)", async () => {
    const { state } = await runSingle(
      "OUT_FOR_DELIVERY",
      statusResult({ statusCode: 5, statusText: "Teslim edildi", isDelivered: true }),
    );
    expect(state.shipments[0]?.status).toBe("DELIVERED");
  });

  it("OUT_FOR_DELIVERY, saglayici 2 (yolda) dese bile GERI gitmez", async () => {
    const { state } = await runSingle("OUT_FOR_DELIVERY", statusResult({ statusCode: 2 }));
    expect(state.shipments[0]?.status).toBe("OUT_FOR_DELIVERY");
  });

  it("ORDER_CREATED bilinmeyen kodla DELIVERED'a atlamaz (kanit yoksa ilerleme yok)", async () => {
    const { state } = await runSingle("ORDER_CREATED", statusResult({ statusCode: 99, statusText: "??" }));
    expect(state.shipments[0]?.status).toBe("ORDER_CREATED");
  });
});

describe("shipment sync — event idempotency", () => {
  it("ayni saglayici yanitiyla tekrarlanan polling duplicate STATUS_CHANGED/TRACKING event uretmez", async () => {
    const track: ShippingTrackingEventResult[] = [
      { sequence: 1, statusText: "Çıkış şubesinde", statusCode: 2, location: "İstanbul", occurredAt: "04-07-2026 09:00:00" },
    ];
    const state = baseState([makeShipment({ status: "ORDER_CREATED" })]);
    let clock = NOW.getTime();
    const { service } = makeService({
      state,
      behaviors: { DHL_ECOMMERCE: { status: statusResult({ statusCode: 2 }), track } },
      now: () => new Date(clock),
    });

    await service.syncEligibleShipments();
    expect(state.events.filter((e) => e.eventType === "STATUS_CHANGED")).toHaveLength(1);
    expect(state.events.filter((e) => e.eventType === "TRACKING_UPDATED")).toHaveLength(1);

    // 20 dk sonra ayni yanit: durum degismedi, kod/metin ayni → yeni event YOK.
    clock += 20 * MIN;
    await service.syncEligibleShipments();
    expect(state.events.filter((e) => e.eventType === "STATUS_CHANGED")).toHaveLength(1);
    expect(state.events.filter((e) => e.eventType === "TRACKING_UPDATED")).toHaveLength(1);
    // lastSyncAt yine de guncellendi (sync yapildi bilgisi kaybolmaz).
    expect(state.shipments[0]?.lastSyncAt?.getTime()).toBe(clock);
  });

  it("saglayici metni degisince (durum ayni kalsa da) yeni STATUS_CHANGED yazilir", async () => {
    const state = baseState([makeShipment({ status: "IN_TRANSIT" })]);
    let clock = NOW.getTime();
    const behaviors: Partial<Record<ShippingProviderType, ProviderBehavior>> = {
      DHL_ECOMMERCE: { status: statusResult({ statusCode: 2, statusText: "Yolda" }) },
    };
    const { service } = makeService({ state, behaviors, now: () => new Date(clock) });
    await service.syncEligibleShipments();
    clock += 20 * MIN;
    behaviors.DHL_ECOMMERCE = { status: statusResult({ statusCode: 3, statusText: "Teslim birimine ulaştı" }) };
    await service.syncEligibleShipments();
    expect(state.events.filter((e) => e.eventType === "STATUS_CHANGED")).toHaveLength(2);
    // Kod 3 hala IN_TRANSIT alt-durumudur; durum degismez ama ham kod saklanir.
    expect(state.shipments[0]?.status).toBe("IN_TRANSIT");
    expect(state.shipments[0]?.shipmentStatusCode).toBe(3);
  });
});

describe("shipment sync — hata/skip davranisi", () => {
  it("saglayici hatasi guvenli kod + backoff yazar; durum ilerlemez; sahte basari yok", async () => {
    const state = baseState([makeShipment({ status: "IN_TRANSIT" })]);
    const { service } = makeService({
      state,
      behaviors: {
        DHL_ECOMMERCE: { error: new ShippingConfigError("PROVIDER_QUERY_FAILED", "Sorgu başarısız.") },
      },
    });
    const summary = await service.syncEligibleShipments();
    expect(summary.failed).toBe(1);
    expect(summary.results[0]?.errorCode).toBe("PROVIDER_QUERY_FAILED");
    const s = state.shipments[0]!;
    expect(s.status).toBe("IN_TRANSIT");
    expect(s.syncAttempts).toBe(1);
    expect(s.lastSyncErrorCode).toBe("PROVIDER_QUERY_FAILED");
    expect(s.nextSyncAt!.getTime()).toBeGreaterThan(NOW.getTime());
    expect(state.events).toHaveLength(0);
  });

  it("NOT_FOUND sahte basari uretmez (FAILED + kod)", async () => {
    const state = baseState([makeShipment()]);
    const { service } = makeService({
      state,
      behaviors: {
        DHL_ECOMMERCE: { error: new ShippingConfigError("PROVIDER_SHIPMENT_NOT_FOUND", "Bulunamadı.") },
      },
    });
    const summary = await service.syncEligibleShipments();
    expect(summary.results[0]?.outcome).toBe("FAILED");
    expect(summary.results[0]?.errorCode).toBe("PROVIDER_SHIPMENT_NOT_FOUND");
    expect(state.shipments[0]?.status).toBe("ORDER_CREATED");
  });

  it("tek gonderinin hatasi batch'in kalanini durdurmaz", async () => {
    const state = baseState([
      makeShipment({ id: "s_fail", referenceId: "rFail" }),
      makeShipment({ id: "s_ok", referenceId: "rOk", providerConfigId: "spc_dhl2" }),
    ]);
    state.configs.set("store_1:spc_dhl2", makeCfg({ id: "spc_dhl2" }));
    let first = true;
    const registry: ShippingAdapterRegistry = {
      get(provider) {
        return {
          provider,
          async getShipmentStatus() {
            if (first) {
              first = false;
              throw new ShippingConfigError("PROVIDER_QUERY_FAILED", "Sorgu başarısız.");
            }
            return statusResult();
          },
          async trackShipment() {
            return [];
          },
        } as unknown as ShippingProviderAdapter;
      },
    };
    const service = createShipmentSyncService({
      config: BASE_CONFIG,
      registry,
      persistence: makePersistence(state),
      now: () => NOW,
    });
    const summary = await service.syncEligibleShipments();
    expect(summary.failed).toBe(1);
    expect(summary.synced).toBe(1);
    expect(state.shipments.find((s) => s.id === "s_ok")?.status).toBe("IN_TRANSIT");
  });

  it("sync desteklemeyen saglayici (MOCK/GELIVER) guvenle atlanir; adapter CAGRILMAZ", async () => {
    const state = baseState([
      makeShipment({ id: "s_mock", provider: "MOCK", providerConfigId: "spc_mock", referenceId: "rM" }),
      makeShipment({ id: "s_geliver", provider: "GELIVER", providerConfigId: "spc_gel", referenceId: "rG" }),
    ]);
    state.configs.set("store_1:spc_mock", makeCfg({ id: "spc_mock", provider: "MOCK" }));
    state.configs.set("store_1:spc_gel", makeCfg({ id: "spc_gel", provider: "GELIVER" }));
    const { service, requested } = makeService({ state, behaviors: {} });
    const summary = await service.syncEligibleShipments();
    expect(summary.skipped).toBe(2);
    expect(summary.results.every((r) => r.outcome === "SKIPPED_UNSUPPORTED")).toBe(true);
    expect(requested).toHaveLength(0);
    expect(state.shipments.every((s) => s.lastSyncErrorCode === "PROVIDER_SYNC_UNSUPPORTED")).toBe(true);
    // Attempt SAYILMAZ (kalici durum; hata degil) ve durum degismez.
    expect(state.shipments.every((s) => s.syncAttempts === 0)).toBe(true);
  });

  it("DISABLED/silinmis provider config'i guvenle atlanir", async () => {
    const state = baseState([
      makeShipment({ id: "s_disabled", providerConfigId: "spc_off", referenceId: "r1" }),
      makeShipment({ id: "s_missing", providerConfigId: "spc_yok", referenceId: "r2" }),
    ]);
    state.configs.set("store_1:spc_off", makeCfg({ id: "spc_off", status: "DISABLED" } as never));
    const { service, requested } = makeService({ state, behaviors: {} });
    const summary = await service.syncEligibleShipments();
    expect(summary.skipped).toBe(2);
    expect(summary.results.every((r) => r.errorCode === "PROVIDER_DISABLED")).toBe(true);
    expect(requested).toHaveLength(0);
  });

  it("worker provider anahtarina gore dispatch eder (DHL hardcode yok)", async () => {
    const state = baseState([makeShipment()]);
    const { service, requested } = makeService({
      state,
      behaviors: { DHL_ECOMMERCE: { status: statusResult() } },
    });
    await service.syncEligibleShipments();
    expect(requested).toEqual(["DHL_ECOMMERCE"]);
  });
});

describe("shipment sync worker — zamanlayici", () => {
  const silentLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  it("SHIPMENT_SYNC_ENABLED=false iken dongu kurulmaz ve runOnce null doner", async () => {
    const handle = startShipmentSyncWorker({
      config: { ...BASE_CONFIG, SHIPMENT_SYNC_ENABLED: false } as AppConfig,
      logger: silentLogger,
    });
    expect(handle.enabled).toBe(false);
    expect(await handle.runOnce()).toBeNull();
    await handle.stop();
  });

  it("enabled=true iken enjekte servisle tur calistirir ve stop temiz kapanir", async () => {
    const state = baseState([makeShipment()]);
    const { service } = makeService({ state, behaviors: { DHL_ECOMMERCE: { status: statusResult() } } });
    const handle = startShipmentSyncWorker({
      config: BASE_CONFIG,
      logger: silentLogger,
      service,
    });
    expect(handle.enabled).toBe(true);
    const summary = await handle.runOnce();
    expect(summary?.synced).toBe(1);
    await handle.stop();
  });

  it("servis hatasi turu oldurmez (runOnce null doner, exception yukselmez)", async () => {
    const handle = startShipmentSyncWorker({
      config: BASE_CONFIG,
      logger: silentLogger,
      service: {
        syncShipmentWithProvider: async () => {
          throw new Error("kullanilmamali");
        },
        syncEligibleShipments: async () => {
          throw new Error("db yok");
        },
      },
    });
    expect(await handle.runOnce()).toBeNull();
    await handle.stop();
  });
});

describe("SHIPMENT_SYNC_* env parsing (PR #15 bos-string deseni)", () => {
  const REQUIRED_ENV = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    REDIS_URL: "redis://localhost:6379",
    INTERNAL_API_TOKEN: "internal-token-123",
    SESSION_SECRET: "s".repeat(32),
  };

  it("varsayilanlar: kapali/300s/25/15dk/10", () => {
    const parsed = envSchema.parse(REQUIRED_ENV);
    expect(parsed.SHIPMENT_SYNC_ENABLED).toBe(false);
    expect(parsed.SHIPMENT_SYNC_INTERVAL_SECONDS).toBe(300);
    expect(parsed.SHIPMENT_SYNC_BATCH_SIZE).toBe(25);
    expect(parsed.SHIPMENT_SYNC_STALE_AFTER_MINUTES).toBe(15);
    expect(parsed.SHIPMENT_SYNC_MAX_ATTEMPTS).toBe(10);
  });

  it("bos string degerler (env_file `KEY=`) config yuklemesini COKERTMEZ, varsayilana duser", () => {
    const parsed = envSchema.parse({
      ...REQUIRED_ENV,
      SHIPMENT_SYNC_ENABLED: "",
      SHIPMENT_SYNC_INTERVAL_SECONDS: "",
      SHIPMENT_SYNC_BATCH_SIZE: "",
      SHIPMENT_SYNC_STALE_AFTER_MINUTES: "",
      SHIPMENT_SYNC_MAX_ATTEMPTS: "",
    });
    expect(parsed.SHIPMENT_SYNC_ENABLED).toBe(false);
    expect(parsed.SHIPMENT_SYNC_INTERVAL_SECONDS).toBe(300);
    expect(parsed.SHIPMENT_SYNC_BATCH_SIZE).toBe(25);
  });

  it("string 'true'/sayilar dogru parse edilir; asiri kucuk aralik reddedilir", () => {
    const parsed = envSchema.parse({
      ...REQUIRED_ENV,
      SHIPMENT_SYNC_ENABLED: "true",
      SHIPMENT_SYNC_INTERVAL_SECONDS: "120",
      SHIPMENT_SYNC_BATCH_SIZE: "50",
    });
    expect(parsed.SHIPMENT_SYNC_ENABLED).toBe(true);
    expect(parsed.SHIPMENT_SYNC_INTERVAL_SECONDS).toBe(120);
    expect(parsed.SHIPMENT_SYNC_BATCH_SIZE).toBe(50);
    expect(() =>
      envSchema.parse({ ...REQUIRED_ENV, SHIPMENT_SYNC_INTERVAL_SECONDS: "5" }),
    ).toThrow();
  });
});
