/**
 * TODO-162 (ADR-205) — Home Discovery section-analytics veri erişim katmanı (ham Prisma; storeId-scope).
 *
 * Tüm sorgular tenant-izole (storeId). Section sahipliği store bazında doğrulanır (uydurma section event
 * reddi + gerçek yönetilen discovery section şartı). Ürün/kampanya/sponsor sahipliği ayrıca kontrol edilir
 * (cross-store event reddi). Impression'lar zaman-pencere dedupe (kimlik+section+ürün); ADD_TO_CART dedupeKey
 * idempotency. Yazma tek satır insert (event append-only). Admin özeti Prisma groupBy ile bounded.
 * RecommendationEvent/SponsoredProductEvent veri katmanlarından BAĞIMSIZ (ayrı tablo: HomeDiscoveryEvent).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@commerce-os/db";
import type { HomeDiscoveryEventType } from "./discovery-event-core.js";

/** Kayıt kimliği: en az biri dolu (customer öncelikli). Ham IP/UA DEĞİL — HMAC hash'ler. */
export interface DiscoveryEventIdentity {
  customerId?: string | null;
  visitorHash?: string | null;
  sessionHash?: string | null;
}

export interface RecordDiscoveryEventInput {
  storeId: string;
  identity: DiscoveryEventIdentity;
  sectionId: string;
  sectionType: string;
  eligibilitySource: string;
  eventType: HomeDiscoveryEventType;
  productId?: string | null;
  campaignId?: string | null;
  sponsoredCampaignId?: string | null;
  placement: string;
  dedupeKey?: string | null;
  now: Date;
}

export interface DiscoverySummaryBucket {
  key: string;
  sectionImpressions: number;
  cardImpressions: number;
  productClicks: number;
  ctaClicks: number;
  addToCart: number;
}

export interface DiscoverySummaryRaw {
  totals: DiscoverySummaryBucket;
  bySectionType: DiscoverySummaryBucket[];
  byEligibilitySource: DiscoverySummaryBucket[];
}

export interface DiscoveryEventData {
  /**
   * Section store'a ait GERÇEK bir yönetilen section mı? Uydurma sectionId ile funnel şişirmeyi engeller.
   * Yalnız `enabled` section kabul edilir (yayından kaldırılan section için geç gelen event yazılmaz).
   * Section'ın DB'deki gerçek `type`'ını döner (route claimed sectionType ile çapraz-doğrular) — yoksa null.
   */
  sectionTypeForStore(storeId: string, sectionId: string): Promise<string | null>;
  /** Ürün store'a ait mi? (enumeration + cross-store guard; ACTIVE şartı YOK — geçmiş görüntüleme olabilir). */
  productBelongsToStore(storeId: string, productId: string): Promise<boolean>;
  /** Dedupe: aynı kimlik+section+ürün+tip için `since`'ten sonraki son event zamanı (ms) — yoksa null. */
  lastEventAtMs(input: {
    storeId: string;
    identity: DiscoveryEventIdentity;
    sectionId: string;
    productId: string | null;
    eventType: HomeDiscoveryEventType;
    since: Date;
  }): Promise<number | null>;
  /** ADD_TO_CART idempotency: bu dedupeKey ile satır var mı? */
  dedupeKeyExists(storeId: string, dedupeKey: string): Promise<boolean>;
  insertEvent(input: RecordDiscoveryEventInput): Promise<void>;
  /**
   * KVKK/GDPR erasure hook. `customerId` FK'siz plain String olduğundan DB Cascade bu satırları KAPSAMAZ →
   * hard customer-deletion akışı eklenirse o akış BU metodu çağırmalıdır. Tenant-scoped (storeId zorunlu):
   * yalnız (storeId, customerId) event'lerini siler; guest (visitorHash-only) event'lere, diğer müşterilere
   * ve diğer store'lara DOKUNMAZ. Silinen satır sayısını döner.
   */
  deleteForCustomer(storeId: string, customerId: string): Promise<number>;
  summarize(input: {
    storeId: string;
    from: Date;
    to: Date;
    sectionType?: string | null;
    eligibilitySource?: string | null;
  }): Promise<DiscoverySummaryRaw>;
}

function identityWhere(identity: DiscoveryEventIdentity): Prisma.HomeDiscoveryEventWhereInput {
  // Dedupe için tek ayırt edici kimlik: customer (öncelikli) → visitor → session.
  if (identity.customerId) return { customerId: identity.customerId };
  if (identity.visitorHash) return { visitorHash: identity.visitorHash };
  if (identity.sessionHash) return { sessionHash: identity.sessionHash };
  return { id: "__none__" }; // eşleşmez (kimliksiz zaten shouldRecordDiscoveryEvent'te elenmiş olur)
}

function emptyBucket(key: string): DiscoverySummaryBucket {
  return { key, sectionImpressions: 0, cardImpressions: 0, productClicks: 0, ctaClicks: 0, addToCart: 0 };
}

export function createDiscoveryEventData(db: PrismaClient = prisma): DiscoveryEventData {
  return {
    async sectionTypeForStore(storeId, sectionId) {
      const row = await db.homeSection.findFirst({
        where: { id: sectionId, storeId, enabled: true },
        select: { type: true },
      });
      return row ? row.type : null;
    },

    async productBelongsToStore(storeId, productId) {
      const row = await db.product.findFirst({ where: { id: productId, storeId }, select: { id: true } });
      return row !== null;
    },

    async lastEventAtMs({ storeId, identity, sectionId, productId, eventType, since }) {
      const row = await db.homeDiscoveryEvent.findFirst({
        where: {
          storeId,
          sectionId,
          eventType,
          productId: productId ?? null,
          createdAt: { gte: since },
          ...identityWhere(identity),
        },
        select: { createdAt: true },
        orderBy: { createdAt: "desc" },
      });
      return row ? row.createdAt.getTime() : null;
    },

    async dedupeKeyExists(storeId, dedupeKey) {
      const row = await db.homeDiscoveryEvent.findFirst({
        where: { storeId, dedupeKey },
        select: { id: true },
      });
      return row !== null;
    },

    async insertEvent(input) {
      await db.homeDiscoveryEvent.create({
        data: {
          storeId: input.storeId,
          customerId: input.identity.customerId ?? null,
          visitorHash: input.identity.visitorHash ?? null,
          sessionHash: input.identity.sessionHash ?? null,
          sectionId: input.sectionId,
          sectionType: input.sectionType,
          eligibilitySource: input.eligibilitySource,
          eventType: input.eventType,
          productId: input.productId ?? null,
          campaignId: input.campaignId ?? null,
          sponsoredCampaignId: input.sponsoredCampaignId ?? null,
          placement: input.placement,
          dedupeKey: input.dedupeKey ?? null,
          createdAt: input.now,
        },
        select: { id: true },
      });
    },

    async deleteForCustomer(storeId, customerId) {
      const result = await db.homeDiscoveryEvent.deleteMany({ where: { storeId, customerId } });
      return result.count;
    },

    async summarize({ storeId, from, to, sectionType, eligibilitySource }) {
      const where: Prisma.HomeDiscoveryEventWhereInput = {
        storeId,
        createdAt: { gte: from, lt: to },
        ...(sectionType ? { sectionType } : {}),
        ...(eligibilitySource ? { eligibilitySource } : {}),
      };
      const grouped = await db.homeDiscoveryEvent.groupBy({
        by: ["eventType", "sectionType", "eligibilitySource"],
        where,
        _count: { _all: true },
      });

      const totals = emptyBucket("__totals__");
      const bySectionType = new Map<string, DiscoverySummaryBucket>();
      const byEligibilitySource = new Map<string, DiscoverySummaryBucket>();
      const bump = (bucket: DiscoverySummaryBucket, type: string, count: number) => {
        if (type === "SECTION_IMPRESSION") bucket.sectionImpressions += count;
        else if (type === "CARD_IMPRESSION") bucket.cardImpressions += count;
        else if (type === "PRODUCT_CLICK") bucket.productClicks += count;
        else if (type === "CTA_CLICK") bucket.ctaClicks += count;
        else if (type === "ADD_TO_CART") bucket.addToCart += count;
      };
      const ensure = (map: Map<string, DiscoverySummaryBucket>, key: string) => {
        let b = map.get(key);
        if (!b) {
          b = emptyBucket(key);
          map.set(key, b);
        }
        return b;
      };

      for (const g of grouped) {
        const count = g._count._all;
        bump(totals, g.eventType, count);
        bump(ensure(bySectionType, g.sectionType), g.eventType, count);
        bump(ensure(byEligibilitySource, g.eligibilitySource), g.eventType, count);
      }

      return {
        totals,
        bySectionType: [...bySectionType.values()].sort((a, b) => a.key.localeCompare(b.key)),
        byEligibilitySource: [...byEligibilitySource.values()].sort((a, b) => a.key.localeCompare(b.key)),
      };
    },
  };
}
