/**
 * TODO-162 (ADR-202/206) — Katman B Discovery viewer-specific veri erişimi.
 *
 * Her kaynak için BOUNDED (indexed, tüm-geçmiş-çekmeyen) sorgu; mevcut alt-veri modülleri REUSE
 * (recently-viewed history + similarity, sponsored home candidates, home CAMPAIGN rule, wishlist/orders).
 * Yeni paralel fiyat/stok hesabı YAZILMAZ: aktif+stok filtresi `recentlyViewed.filterVisibleInStock`
 * (ProductSearchDocument: status ACTIVE + hasStock); fiyat/kampanya endpoint'in `buildPublicProduct`
 * projeksiyonundan. Bu modül YALNIZ aday productId listeleri + ucuz sayaçlar döner (karar discovery-core'da).
 */
import type { PrismaClient } from "@prisma/client";
import type { RecentlyViewedData, ViewerIdentity } from "../recently-viewed/data.js";
import { rankSimilar } from "../recently-viewed/similarity-core.js";
import type { SponsoredData } from "../sponsored/data.js";
import type { HomeDataAccess } from "./data.js";

/** Similarity aday-yükleme tavanı (per anchor). recently-viewed ile hizalı bounded değer. */
const SIMILAR_CANDIDATES_PER_ANCHOR = 120;
/** Çok-anchor merge'de kullanılacak anchor tavanı (cart/purchase). */
const MAX_ANCHORS = 6;
/** Recently-viewed / order tarama tavanları (aktif+stok filtresi öncesi headroom). */
const RV_SCAN_LIMIT = 24;
const ORDER_SCAN_LIMIT = 20;
const WISHLIST_SCAN_LIMIT = 50;

export interface DiscoveryDataDeps {
  prisma: PrismaClient;
  recentlyViewed: RecentlyViewedData;
  sponsored: SponsoredData;
  homeData: HomeDataAccess;
}

export interface DiscoveryIdentity {
  customerId: string | null;
  visitorHash: string | null;
}

function toViewerIdentity(identity: DiscoveryIdentity): ViewerIdentity | null {
  if (identity.customerId) return { customerId: identity.customerId };
  if (identity.visitorHash) return { visitorHash: identity.visitorHash };
  return null;
}

const PAID_STATUSES = ["PAID", "AUTHORIZED"] as const;

/** Sadece aktif+stokta olanları koru (mevcut ProductSearchDocument filtresi); SIRA korunur. */
async function keepVisible(
  deps: DiscoveryDataDeps,
  storeId: string,
  orderedIds: string[],
): Promise<string[]> {
  if (orderedIds.length === 0) return [];
  const visible = await deps.recentlyViewed.filterVisibleInStock(storeId, orderedIds);
  return orderedIds.filter((id) => visible.has(id));
}

/**
 * Çok-anchor similarity merge: her anchor için ranked adayları topla, productId başına EN İYİ skoru tut,
 * skor DESC → productId ASC sırala. `exclude` (cart/satın-alınan) ve anchor'ların kendisi elenir.
 */
async function similarFromAnchors(
  deps: DiscoveryDataDeps,
  storeId: string,
  anchorIds: string[],
  exclude: ReadonlySet<string>,
  limit: number,
): Promise<string[]> {
  const bestScore = new Map<string, number>();
  for (const anchorId of anchorIds.slice(0, MAX_ANCHORS)) {
    const anchor = await deps.recentlyViewed.loadAnchor(storeId, anchorId);
    if (!anchor) continue;
    const { features } = await deps.recentlyViewed.loadSimilarCandidates(
      storeId,
      anchor.features,
      SIMILAR_CANDIDATES_PER_ANCHOR,
    );
    const ranked = rankSimilar(anchor.features, features, SIMILAR_CANDIDATES_PER_ANCHOR);
    for (const r of ranked) {
      if (exclude.has(r.productId)) continue;
      const prev = bestScore.get(r.productId);
      if (prev === undefined || r.score > prev) bestScore.set(r.productId, r.score);
    }
  }
  const ordered = [...bestScore.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id]) => id);
  return keepVisible(deps, storeId, ordered).then((ids) => ids.slice(0, limit));
}

export function createDiscoveryData(deps: DiscoveryDataDeps) {
  return {
    /** Ucuz sinyal sayaçları (heavy query öncesi gate). cartItemCount çağıran katmandan (cart index). */
    async cheapCounts(
      storeId: string,
      identity: DiscoveryIdentity,
      wishlistRefIds: string[],
    ): Promise<{ recentlyViewedCount: number; completedOrderCount: number; wishlistItemCount: number }> {
      const viewer = toViewerIdentity(identity);
      const [recentlyViewedRows, completedOrderCount, wishlistItemCount] = await Promise.all([
        viewer
          ? deps.recentlyViewed.listHistory(storeId, viewer, RV_SCAN_LIMIT)
          : Promise.resolve([]),
        identity.customerId
          ? deps.prisma.order.count({
              where: {
                storeId,
                customerId: identity.customerId,
                paymentStatus: { in: [...PAID_STATUSES] },
                status: { not: "CANCELLED" },
              },
            })
          : Promise.resolve(0),
        // Auth: sunucu CustomerList otoritedir; guest: body wishlistRefIds.
        identity.customerId
          ? deps.prisma.customerListItem.count({
              where: {
                list: { storeId, customerId: identity.customerId, isDefault: true, type: "WISHLIST" },
                variantId: null,
              },
            })
          : Promise.resolve(wishlistRefIds.length),
      ]);
      return { recentlyViewedCount: recentlyViewedRows.length, completedOrderCount, wishlistItemCount };
    },

    /** CONTINUE_BROWSING: PDP view geçmişi (lastViewedAt DESC) → aktif+stok → SIRA korunur. */
    async continueBrowsingIds(storeId: string, identity: DiscoveryIdentity, limit: number): Promise<string[]> {
      const viewer = toViewerIdentity(identity);
      if (!viewer) return [];
      const rows = await deps.recentlyViewed.listHistory(storeId, viewer, RV_SCAN_LIMIT);
      const ids = rows.map((r) => r.productId);
      return (await keepVisible(deps, storeId, ids)).slice(0, limit);
    },

    /** CART_RECOMMENDATIONS: cart ürünleri anchor → similarity; cart ürünleri elenir. */
    async cartRecommendationIds(storeId: string, cartProductIds: string[], limit: number): Promise<string[]> {
      if (cartProductIds.length === 0) return [];
      return similarFromAnchors(deps, storeId, cartProductIds, new Set(cartProductIds), limit);
    },

    /** Satın alınan (paid, non-cancelled) ürün id'leri (recent-first, distinct). */
    async purchasedProductIds(storeId: string, customerId: string): Promise<string[]> {
      const orders = await deps.prisma.order.findMany({
        where: {
          storeId,
          customerId,
          paymentStatus: { in: [...PAID_STATUSES] },
          status: { not: "CANCELLED" },
        },
        orderBy: { createdAt: "desc" },
        take: ORDER_SCAN_LIMIT,
        select: { lines: { select: { productId: true } } },
      });
      const seen = new Set<string>();
      const ordered: string[] = [];
      for (const order of orders) {
        for (const line of order.lines) {
          if (seen.has(line.productId)) continue;
          seen.add(line.productId);
          ordered.push(line.productId);
        }
      }
      return ordered;
    },

    /** REPURCHASE: satın alınan ürünler → aktif+stok (recent-first). */
    async repurchaseIds(storeId: string, customerId: string, limit: number): Promise<string[]> {
      const purchased = await this.purchasedProductIds(storeId, customerId);
      return (await keepVisible(deps, storeId, purchased)).slice(0, limit);
    },

    /** SIMILAR_TO_PURCHASED: satın alınan ürünler anchor → similarity; satın alınanlar elenir. */
    async similarToPurchasedIds(storeId: string, customerId: string, limit: number): Promise<string[]> {
      const purchased = await this.purchasedProductIds(storeId, customerId);
      if (purchased.length === 0) return [];
      return similarFromAnchors(deps, storeId, purchased, new Set(purchased), limit);
    },

    /**
     * PERSONALIZED_DEALS aday HAM kümesi: gerçek kullanıcı sinyali ürünleri (wishlist + recently-viewed +
     * cart [+ auth satın-alınan]). Endpoint bunları projekte edip YALNIZ gerçekten indirimli olanları tutar
     * (kampanya badge veya compareAt>price). Böylece "genel kampanya" tek başına yeterli olmaz (§9).
     */
    async personalizedSignalProductIds(
      storeId: string,
      identity: DiscoveryIdentity,
      cartProductIds: string[],
      wishlistRefIds: string[],
    ): Promise<string[]> {
      const viewer = toViewerIdentity(identity);
      const rvRows = viewer ? await deps.recentlyViewed.listHistory(storeId, viewer, RV_SCAN_LIMIT) : [];
      const wishlistIds = identity.customerId
        ? (
            await deps.prisma.customerListItem.findMany({
              where: {
                list: { storeId, customerId: identity.customerId, isDefault: true, type: "WISHLIST" },
                variantId: null,
              },
              take: WISHLIST_SCAN_LIMIT,
              select: { productId: true },
            })
          ).map((i) => i.productId)
        : wishlistRefIds;
      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const id of [...wishlistIds, ...rvRows.map((r) => r.productId), ...cartProductIds]) {
        if (seen.has(id)) continue;
        seen.add(id);
        ordered.push(id);
      }
      return keepVisible(deps, storeId, ordered);
    },

    /**
     * WISHLIST_DEALS aday HAM kümesi: aktif wishlist ürünleri (auth: CustomerList; guest: body refs) → aktif+stok.
     * Endpoint YALNIZ gerçek kampanya/doğrulanmış fiyat-düşüşü olanları tutar (fiyat geçmişi yoksa iddia üretmez).
     */
    async wishlistActiveProductIds(
      storeId: string,
      identity: DiscoveryIdentity,
      wishlistRefIds: string[],
    ): Promise<string[]> {
      const ids = identity.customerId
        ? (
            await deps.prisma.customerListItem.findMany({
              where: {
                list: { storeId, customerId: identity.customerId, isDefault: true, type: "WISHLIST" },
                variantId: null,
              },
              take: WISHLIST_SCAN_LIMIT,
              orderBy: { addedAt: "desc" },
              select: { productId: true },
            })
          ).map((i) => i.productId)
        : wishlistRefIds;
      return keepVisible(deps, storeId, ids);
    },

    /** DAILY_DEALS aday HAM kümesi: aktif kampanyalı ürünler (home CAMPAIGN rule reuse). Endpoint indirim süzer. */
    async dailyDealCandidateIds(storeId: string, now: Date): Promise<string[]> {
      const ids = await deps.homeData.resolveDynamicShowcaseProductIds(storeId, "CAMPAIGN", {}, now);
      return keepVisible(deps, storeId, ids);
    },

    /** SPONSORED_RAIL: mevcut sponsorship home candidate resolver (agreement-gated, active+in-stock). */
    async sponsoredCandidates(
      storeId: string,
      now: Date,
      limit: number,
    ): Promise<Array<{ productId: string; campaignId: string; placementId: string }>> {
      try {
        const resolved = await deps.sponsored.resolveHomeCandidates(storeId, { now, limit });
        return resolved.map((c) => ({ productId: c.item.productId, campaignId: c.campaignId, placementId: c.placementId }));
      } catch {
        return [];
      }
    },
  };
}

export type DiscoveryData = ReturnType<typeof createDiscoveryData>;
