/**
 * TODO-129 — Provider-agnostic shipment sync cekirdegi.
 *
 * Hem zamanlanmis worker (sync-worker.ts) hem manuel admin uclari (routes.ts:
 * tekil sync + sync-all) AYNI cekirdegi kullanir → davranis drift'i olmaz.
 *
 * Guvenlik/dogruluk garantileri:
 *  - Worker saglayici HTTP detayini BILMEZ: shipment.provider → adapter registry
 *    dispatch; normalize esleme status-map.ts'ten (regresyon korumali rank).
 *  - Durum yalniz saglayici KANITIYLA ilerler; terminal durumdan geri donulmez
 *    (mapProviderStatusToShipmentStatus). NOT_FOUND/4xx/5xx durumu ILERLETMEZ,
 *    sahte basari uretmez; sanitize hata kodu + backoff yazilir.
 *  - Event idempotency: STATUS_CHANGED yalniz gercek degisimde (durum gecisi veya
 *    saglayici kod/metin degisimi) yazilir; TRACKING_UPDATED kumulatif listeye karsi
 *    dogal anahtarla (shipmentTrackingEventKey) dedupe edilir. Tekrarlanan polling
 *    turlari duplicate event URETMEZ.
 *  - Sync desteklemeyen saglayici (bkz. providerSupportsShipmentSync) guvenle
 *    atlanir: PROVIDER_SYNC_UNSUPPORTED kaydedilir, batch DEVAM eder.
 *  - Gonderi basina hata batch'i durdurmaz; raw payload/secret ASLA loglanmaz/yazilmaz.
 */
import { prisma } from "@commerce-os/db";
import type { AppConfig } from "@commerce-os/config";
import type { Logger } from "@commerce-os/logger";
import { Prisma } from "@prisma/client";
import type { ShipmentStatus, ShippingProviderType } from "@prisma/client";
import { ShippingConfigError } from "./errors.js";
import type { ShippingAdapterRegistry } from "./adapters/registry.js";
import { buildShippingActionContext, type ConfigWithCredentials } from "./context.js";
import { providerSupportsShipmentSync } from "./serialize.js";
import {
  mapProviderStatusToShipmentStatus,
  parseProviderDate,
  shipmentTrackingEventKey,
  SYNCABLE_SHIPMENT_STATUSES,
} from "./status-map.js";

/* ───────────────────────── Kayit/persistence sozlesmeleri ───────────────────────── */

/** Sync cekirdeginin ihtiyac duydugu shipment projeksiyonu (tam Prisma modeli GEREKMEZ). */
export interface SyncShipmentRecord {
  id: string;
  storeId: string;
  providerConfigId: string;
  provider: ShippingProviderType;
  referenceId: string;
  externalShipmentId: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  shipmentStatusCode: number | null;
  status: ShipmentStatus;
  syncAttempts: number;
}

export interface SyncEligibleQuery {
  statuses: ShipmentStatus[];
  batchSize: number;
  /** Worker secimi: lastSyncAt null ya da bu esikten eski olanlar. null => stale filtresi yok (manuel). */
  staleBefore: Date | null;
  /** Worker secimi: nextSyncAt null ya da now'dan kucuk-esit. null => backoff filtresi yok (manuel). */
  now: Date | null;
  /** Worker secimi: syncAttempts < maxAttempts. null => esik yok (manuel). */
  maxAttempts: number | null;
  /** Manuel sync-all store kapsamindadir; worker cross-store calisir (undefined). */
  storeId?: string;
}

export interface SyncStatusEventInput {
  statusCode: number | null;
  statusText: string | null;
  trackingUrl: string | null;
  occurredAt: Date | null;
  isDelivered: boolean;
  deliveryTo: string | null;
}

export interface SyncTrackingEventInput {
  sequence: number | null;
  statusCode: number | null;
  statusText: string | null;
  location: string | null;
  occurredAt: Date | null;
  occurredAtRaw: string | null;
  trackingUrl: string | null;
}

export interface SyncSuccessInput {
  shipmentId: string;
  storeId: string;
  provider: ShippingProviderType;
  nextStatus: ShipmentStatus;
  shipmentStatusCode: number | null;
  trackingUrl: string | null;
  trackingNumber: string | null;
  syncedAt: Date;
  /** null => durum/kod/metin degismedi, STATUS_CHANGED event YAZILMAZ (idempotent polling). */
  statusEvent: SyncStatusEventInput | null;
  /** Daha once yazilmamis (dedupe edilmis) hareketler. */
  trackingEvents: SyncTrackingEventInput[];
}

export interface SyncFailureInput {
  shipmentId: string;
  syncedAt: Date;
  syncAttempts: number;
  nextSyncAt: Date | null;
  /** Sanitize hata kodu (or. PROVIDER_QUERY_FAILED, PROVIDER_SYNC_UNSUPPORTED, PROVIDER_DISABLED). */
  errorCode: string;
}

export interface ShipmentSyncPersistence {
  findEligibleShipments(query: SyncEligibleQuery): Promise<SyncShipmentRecord[]>;
  /** {storeId} scoped config yukleme — cross-store cozumleme IMKANSIZ. */
  loadProviderConfig(storeId: string, providerConfigId: string): Promise<ConfigWithCredentials | null>;
  /** Son STATUS_CHANGED event ozeti (duplicate STATUS_CHANGED onlemi icin). */
  getLastStatusEvent(
    shipmentId: string,
  ): Promise<{ statusCode: number | null; statusText: string | null } | null>;
  /** Mevcut TRACKING_UPDATED dogal anahtarlari (kumulatif liste dedupe'u icin). */
  listTrackingEvents(
    shipmentId: string,
  ): Promise<{ statusText: string | null; location: string | null; occurredAt: Date | null }[]>;
  /** Durum + sync metadata + event yazimi ATOMIK uygulanir. */
  applySyncSuccess(input: SyncSuccessInput): Promise<void>;
  /** Hata metadata'si (backoff/attempt/kod); event YAZILMAZ, durum DEGISMEZ. */
  recordSyncFailure(input: SyncFailureInput): Promise<void>;
}

/* ───────────────────────── Sonuc modelleri ───────────────────────── */

export type ShipmentSyncOutcome = "SYNCED" | "SKIPPED_DISABLED" | "SKIPPED_UNSUPPORTED" | "FAILED";

export interface ShipmentSyncResultItem {
  shipmentId: string;
  storeId: string;
  provider: ShippingProviderType;
  ok: boolean;
  outcome: ShipmentSyncOutcome;
  previousStatus: ShipmentStatus;
  status: ShipmentStatus | null;
  statusChanged: boolean;
  errorCode: string | null;
}

export interface ShipmentSyncSummary {
  scanned: number;
  synced: number;
  failed: number;
  skipped: number;
  results: ShipmentSyncResultItem[];
}

export interface ShipmentSyncServiceDeps {
  config: AppConfig;
  registry: ShippingAdapterRegistry;
  persistence: ShipmentSyncPersistence;
  logger?: Logger;
  now?: () => Date;
}

export interface SyncEligibleOptions {
  /** Manuel sync-all: store scoped + stale/backoff/attempt filtreleri UYGULANMAZ. */
  storeId?: string;
  force?: boolean;
  batchSize?: number;
}

export interface ShipmentSyncService {
  /**
   * Tek gonderiyi saglayiciyla senkronlar. Saglayici/config hatasini FIRLATIR
   * (route sendShippingError ile yansitir); firlatmadan once hata metadata'sini yazar.
   */
  syncShipmentWithProvider(
    shipment: SyncShipmentRecord,
    cfg: ConfigWithCredentials,
  ): Promise<{ statusChanged: boolean; status: ShipmentStatus }>;
  /** Uygun gonderileri secer ve gonderi basina izole (batch'i durdurmayan) senkron yurutur. */
  syncEligibleShipments(options?: SyncEligibleOptions): Promise<ShipmentSyncSummary>;
}

/** Ardisik hata backoff'u: staleAfter * 2^(attempt-1), 6 saatle sinirli (worker'i bogmamak icin). */
const SYNC_BACKOFF_MAX_MS = 6 * 60 * 60 * 1000;
function computeSyncBackoffMs(staleAfterMs: number, attempts: number): number {
  const exp = Math.min(Math.max(attempts - 1, 0), 5);
  return Math.min(staleAfterMs * 2 ** exp, SYNC_BACKOFF_MAX_MS);
}

export function createShipmentSyncService(deps: ShipmentSyncServiceDeps): ShipmentSyncService {
  const now = deps.now ?? (() => new Date());
  const staleAfterMs = deps.config.SHIPMENT_SYNC_STALE_AFTER_MINUTES * 60 * 1000;

  async function syncShipmentWithProvider(
    shipment: SyncShipmentRecord,
    cfg: ConfigWithCredentials,
  ): Promise<{ statusChanged: boolean; status: ShipmentStatus }> {
    try {
      const ctx = buildShippingActionContext(deps.config, cfg);
      const lookup = {
        context: ctx,
        referenceId: shipment.referenceId,
        shipmentId: shipment.externalShipmentId ?? undefined,
      };
      const adapter = deps.registry.get(cfg.provider);
      const status = await adapter.getShipmentStatus(lookup);
      const track = await adapter.trackShipment(lookup).catch(() => []);

      // TODO-140 — Once getShipmentStatus kanitiyla (kod/isDelivered) ilerlet; durum push'u
      // METNI TEK BASINA kanit sayilmaz (statusText: null — TODO-130 ile ayni kural). Sonra
      // HAREKET (trackshipment) metinlerini ayni yardimciyi katlayarak uygula: kod tasimayan
      // "AKTARMADA"/"TRANSFER MERKEZINDE" hareketi IN_TRANSIT'e cikarir. Regresyon/terminal
      // korumasi helper icinde (webhook ile AYNI yol → drift yok).
      let nextStatus = mapProviderStatusToShipmentStatus(
        { statusCode: status.statusCode ?? null, isDelivered: status.isDelivered, statusText: null },
        shipment.status,
      );
      for (const ev of track) {
        nextStatus = mapProviderStatusToShipmentStatus(
          { statusCode: ev.statusCode ?? null, isDelivered: false, statusText: ev.statusText },
          nextStatus,
        );
      }
      const statusChanged = nextStatus !== shipment.status;

      // STATUS_CHANGED idempotency: durum gecisi YA DA saglayici kod/metin degisimi yoksa
      // (ayni yaniti tekrar polling) yeni event yazilmaz — timeline'da duplikasyon olusmaz.
      const lastStatusEvent = await deps.persistence.getLastStatusEvent(shipment.id);
      const providerInfoChanged =
        lastStatusEvent == null ||
        lastStatusEvent.statusCode !== (status.statusCode ?? null) ||
        (lastStatusEvent.statusText ?? null) !== (status.statusText ?? null);
      const statusEvent: SyncStatusEventInput | null =
        statusChanged || providerInfoChanged
          ? {
              statusCode: status.statusCode ?? null,
              statusText: status.statusText ?? null,
              trackingUrl: status.trackingUrl ?? null,
              occurredAt: parseProviderDate(status.deliveryDateTime ?? null),
              isDelivered: status.isDelivered,
              deliveryTo: status.deliveryTo ?? null,
            }
          : null;

      // F3C.6 — trackshipment kumulatif liste dondugu icin daha once yazilmis hareketler atlanir.
      const existingTrack = await deps.persistence.listTrackingEvents(shipment.id);
      const seenKeys = new Set(existingTrack.map(shipmentTrackingEventKey));
      const trackingEvents: SyncTrackingEventInput[] = [];
      for (const ev of track) {
        const occurredAt = parseProviderDate(ev.occurredAt);
        const key = shipmentTrackingEventKey({ statusText: ev.statusText, location: ev.location, occurredAt });
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        trackingEvents.push({
          sequence: ev.sequence,
          statusCode: ev.statusCode ?? null,
          statusText: ev.statusText,
          location: ev.location,
          occurredAt,
          occurredAtRaw: ev.occurredAt,
          trackingUrl: ev.trackingUrl ?? status.trackingUrl ?? null,
        });
      }

      await deps.persistence.applySyncSuccess({
        shipmentId: shipment.id,
        storeId: shipment.storeId,
        provider: shipment.provider,
        nextStatus,
        shipmentStatusCode: status.statusCode ?? shipment.shipmentStatusCode,
        trackingUrl: status.trackingUrl ?? shipment.trackingUrl,
        trackingNumber: status.externalShipmentId ?? shipment.trackingNumber,
        syncedAt: now(),
        statusEvent,
        trackingEvents,
      });
      return { statusChanged, status: nextStatus };
    } catch (error) {
      // Saglayici/config hatasi: durum ILERLEMEZ, sahte basari YOK; sanitize kod + backoff.
      const errorCode = error instanceof ShippingConfigError ? error.code : "SYNC_FAILED";
      const attempts = shipment.syncAttempts + 1;
      await deps.persistence.recordSyncFailure({
        shipmentId: shipment.id,
        syncedAt: now(),
        syncAttempts: attempts,
        nextSyncAt: new Date(now().getTime() + computeSyncBackoffMs(staleAfterMs, attempts)),
        errorCode,
      });
      throw error;
    }
  }

  /** Gonderi basina izole yurutme: skip/hata batch'i durdurmaz, sonuc kaydi doner. */
  async function syncOneSafely(
    shipment: SyncShipmentRecord,
    cfg: ConfigWithCredentials | null,
  ): Promise<ShipmentSyncResultItem> {
    const base = {
      shipmentId: shipment.id,
      storeId: shipment.storeId,
      provider: shipment.provider,
      previousStatus: shipment.status,
    };
    if (!cfg || cfg.status !== "ENABLED") {
      // Saglayici kapali/silinmis: lastSyncAt guncellenir ki worker her turda ayni
      // gonderiyi yeniden secip donmesin (stale-after dogal throttling).
      await deps.persistence.recordSyncFailure({
        shipmentId: shipment.id,
        syncedAt: now(),
        syncAttempts: shipment.syncAttempts,
        nextSyncAt: null,
        errorCode: "PROVIDER_DISABLED",
      });
      return { ...base, ok: false, outcome: "SKIPPED_DISABLED", status: shipment.status, statusChanged: false, errorCode: "PROVIDER_DISABLED" };
    }
    if (!providerSupportsShipmentSync(cfg.provider)) {
      // Sync desteklemeyen saglayici (MOCK/GELIVER): guvenli skip; attempt SAYILMAZ.
      await deps.persistence.recordSyncFailure({
        shipmentId: shipment.id,
        syncedAt: now(),
        syncAttempts: shipment.syncAttempts,
        nextSyncAt: null,
        errorCode: "PROVIDER_SYNC_UNSUPPORTED",
      });
      return { ...base, ok: false, outcome: "SKIPPED_UNSUPPORTED", status: shipment.status, statusChanged: false, errorCode: "PROVIDER_SYNC_UNSUPPORTED" };
    }
    try {
      const result = await syncShipmentWithProvider(shipment, cfg);
      return { ...base, ok: true, outcome: "SYNCED", status: result.status, statusChanged: result.statusChanged, errorCode: null };
    } catch (error) {
      const errorCode = error instanceof ShippingConfigError ? error.code : "SYNC_FAILED";
      return { ...base, ok: false, outcome: "FAILED", status: shipment.status, statusChanged: false, errorCode };
    }
  }

  async function syncEligibleShipments(options?: SyncEligibleOptions): Promise<ShipmentSyncSummary> {
    const force = options?.force === true;
    const nowAt = now();
    const shipments = await deps.persistence.findEligibleShipments({
      statuses: SYNCABLE_SHIPMENT_STATUSES,
      batchSize: options?.batchSize ?? deps.config.SHIPMENT_SYNC_BATCH_SIZE,
      staleBefore: force ? null : new Date(nowAt.getTime() - staleAfterMs),
      now: force ? null : nowAt,
      maxAttempts: force ? null : deps.config.SHIPMENT_SYNC_MAX_ATTEMPTS,
      storeId: options?.storeId,
    });

    const cfgCache = new Map<string, ConfigWithCredentials | null>();
    const results: ShipmentSyncResultItem[] = [];
    for (const shipment of shipments) {
      let cfg = cfgCache.get(shipment.providerConfigId);
      if (cfg === undefined) {
        cfg = await deps.persistence.loadProviderConfig(shipment.storeId, shipment.providerConfigId);
        cfgCache.set(shipment.providerConfigId, cfg);
      }
      results.push(await syncOneSafely(shipment, cfg));
    }

    const summary: ShipmentSyncSummary = {
      scanned: shipments.length,
      synced: results.filter((r) => r.outcome === "SYNCED").length,
      failed: results.filter((r) => r.outcome === "FAILED").length,
      skipped: results.filter((r) => r.outcome === "SKIPPED_DISABLED" || r.outcome === "SKIPPED_UNSUPPORTED").length,
      results,
    };
    // Guvenli ozet log: id/store/provider/durum/kod — raw payload/secret ASLA.
    for (const r of results) {
      if (r.statusChanged) {
        deps.logger?.info("shipment sync status advanced", {
          shipmentId: r.shipmentId,
          storeId: r.storeId,
          provider: r.provider,
          previousStatus: r.previousStatus,
          status: r.status,
        });
      } else if (r.outcome === "FAILED") {
        deps.logger?.warn("shipment sync failed", {
          shipmentId: r.shipmentId,
          storeId: r.storeId,
          provider: r.provider,
          previousStatus: r.previousStatus,
          errorCode: r.errorCode,
        });
      }
    }
    return summary;
  }

  return { syncShipmentWithProvider, syncEligibleShipments };
}

/* ───────────── Prisma persistence (runtime wiring) ───────────── */

export function createPrismaShipmentSyncPersistence(): ShipmentSyncPersistence {
  return {
    async findEligibleShipments(query) {
      const scheduleFilters: Prisma.ShipmentWhereInput[] = [];
      if (query.now) {
        scheduleFilters.push({ OR: [{ nextSyncAt: null }, { nextSyncAt: { lte: query.now } }] });
      }
      if (query.staleBefore) {
        scheduleFilters.push({ OR: [{ lastSyncAt: null }, { lastSyncAt: { lte: query.staleBefore } }] });
      }
      return prisma.shipment.findMany({
        where: {
          ...(query.storeId ? { storeId: query.storeId } : {}),
          status: { in: query.statuses },
          ...(query.maxAttempts != null ? { syncAttempts: { lt: query.maxAttempts } } : {}),
          ...(scheduleFilters.length > 0 ? { AND: scheduleFilters } : {}),
        },
        // Hic senkronlanmamis gonderiler ONCE; sonra en eski senkronlananlar (adil tarama).
        orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
        take: query.batchSize,
        select: {
          id: true,
          storeId: true,
          providerConfigId: true,
          provider: true,
          referenceId: true,
          externalShipmentId: true,
          trackingNumber: true,
          trackingUrl: true,
          shipmentStatusCode: true,
          status: true,
          syncAttempts: true,
        },
      });
    },

    async loadProviderConfig(storeId, providerConfigId) {
      return prisma.shippingProviderConfig.findFirst({
        where: { id: providerConfigId, storeId },
        include: { credentials: true },
      });
    },

    async getLastStatusEvent(shipmentId) {
      return prisma.shipmentEvent.findFirst({
        where: { shipmentId, eventType: "STATUS_CHANGED" },
        orderBy: { createdAt: "desc" },
        select: { statusCode: true, statusText: true },
      });
    },

    async listTrackingEvents(shipmentId) {
      return prisma.shipmentEvent.findMany({
        where: { shipmentId, eventType: "TRACKING_UPDATED" },
        select: { statusText: true, location: true, occurredAt: true },
      });
    },

    async applySyncSuccess(input) {
      await prisma.$transaction(async (tx) => {
        await tx.shipment.update({
          where: { id: input.shipmentId },
          data: {
            status: input.nextStatus,
            shipmentStatusCode: input.shipmentStatusCode,
            trackingUrl: input.trackingUrl,
            trackingNumber: input.trackingNumber,
            lastSyncAt: input.syncedAt,
            nextSyncAt: null,
            syncAttempts: 0,
            lastSyncErrorCode: null,
          },
        });
        if (input.statusEvent) {
          await tx.shipmentEvent.create({
            data: {
              storeId: input.storeId,
              shipmentId: input.shipmentId,
              provider: input.provider,
              eventType: "STATUS_CHANGED",
              statusCode: input.statusEvent.statusCode,
              statusText: input.statusEvent.statusText,
              occurredAt: input.statusEvent.occurredAt,
              trackingUrl: input.statusEvent.trackingUrl,
              rawSafeJson: {
                statusCode: input.statusEvent.statusCode,
                statusText: input.statusEvent.statusText,
                isDelivered: input.statusEvent.isDelivered,
                deliveryTo: input.statusEvent.deliveryTo,
              },
            },
          });
        }
        for (const ev of input.trackingEvents) {
          await tx.shipmentEvent.create({
            data: {
              storeId: input.storeId,
              shipmentId: input.shipmentId,
              provider: input.provider,
              eventType: "TRACKING_UPDATED",
              statusCode: ev.statusCode,
              statusText: ev.statusText,
              location: ev.location,
              occurredAt: ev.occurredAt,
              trackingUrl: ev.trackingUrl,
              rawSafeJson: {
                sequence: ev.sequence,
                statusText: ev.statusText,
                location: ev.location,
                occurredAt: ev.occurredAtRaw,
              },
            },
          });
        }
      });
    },

    async recordSyncFailure(input) {
      await prisma.shipment.update({
        where: { id: input.shipmentId },
        data: {
          lastSyncAt: input.syncedAt,
          nextSyncAt: input.nextSyncAt,
          syncAttempts: input.syncAttempts,
          lastSyncErrorCode: input.errorCode,
        },
      });
    },
  };
}
