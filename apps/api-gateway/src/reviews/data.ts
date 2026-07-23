/**
 * TODO-159E (ADR-094) — Product Reviews & Ratings — Prisma veri erişimi.
 *
 * Tüm sorgular `storeId` ile scope'lanır (tenant izolasyonu). Uygunluk (eligibility)
 * SUNUCU-otoriter: OrderLine ↔ Order ↔ Shipment join'i ile satın alma kanıtı burada
 * doğrulanır (UI'dan gelen değere güvenilmez). Aggregate = ProductRatingAggregate
 * projection'ı; TEK yazma yolu `recomputeAggregate` (yalnız APPROVED; tamsayı toplamlar
 * → float drift yok). Moderasyon/edit/helpful mutasyonları transaction içinde çalışır.
 */
import { prisma, type TransactionClient } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { ProductReviewStatus } from "@commerce-os/contracts";

export interface ReviewRecord {
  id: string;
  storeId: string;
  productId: string;
  variantId: string | null;
  customerId: string;
  orderId: string;
  orderLineId: string;
  rating: number;
  title: string | null;
  body: string;
  status: ProductReviewStatus;
  verifiedPurchase: boolean;
  helpfulCount: number;
  moderationNote: string | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Yoruma uygun sipariş kalemi (Order/Shipment join'inden türetilir). */
export interface EligibleLine {
  orderLineId: string;
  orderId: string;
  orderNumber: string;
  productId: string;
  productTitle: string;
  productSlug: string;
  variantId: string | null;
  variantLabel: string | null;
  purchasedAt: Date;
}

export interface AggregateRecord {
  productId: string;
  storeId: string;
  reviewCount: number;
  sumRating: number;
  count1: number;
  count2: number;
  count3: number;
  count4: number;
  count5: number;
  averageTimes100: number;
}

/** Admin liste + public liste satırlarına ürün adı/varyant için hafif ürün özeti. */
export interface ReviewProductInfo {
  id: string;
  title: string;
  slug: string;
}

/** Admin liste filtreleri (hepsi sunucuda ZORLANIR). */
export interface AdminReviewFilters {
  status?: ProductReviewStatus;
  rating?: number;
  verifiedPurchase?: boolean;
  productId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  search?: string;
  sortBy?: "createdAt" | "rating" | "status" | "helpfulCount";
  sortOrder?: "asc" | "desc";
  limit: number;
  offset: number;
}

export interface PublicListOptions {
  rating?: number;
  sort?: "newest" | "oldest" | "highest" | "lowest" | "most_helpful";
  limit: number;
  offset: number;
}

export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export interface ReviewData {
  // ── Uygunluk (server-authoritative) ─────────────────────────────────────
  listEligibleLines(storeId: string, customerId: string): Promise<EligibleLine[]>;
  findEligibleLineForProduct(
    storeId: string,
    customerId: string,
    productId: string,
  ): Promise<EligibleLine | null>;
  /** orderLineId'nin bu müşteriye/mağazaya ait + uygun + kullanılmamış olduğunu doğrular. */
  resolveEligibleLineById(
    storeId: string,
    customerId: string,
    orderLineId: string,
  ): Promise<EligibleLine | null>;

  // ── Yorum CRUD ───────────────────────────────────────────────────────────
  findReviewById(storeId: string, id: string): Promise<ReviewRecord | null>;
  findOwnReview(storeId: string, customerId: string, id: string): Promise<ReviewRecord | null>;
  findReviewByProductCustomer(
    storeId: string,
    productId: string,
    customerId: string,
  ): Promise<ReviewRecord | null>;
  createReview(input: {
    storeId: string;
    productId: string;
    variantId: string | null;
    customerId: string;
    orderId: string;
    orderLineId: string;
    rating: number;
    title: string | null;
    body: string;
  }): Promise<ReviewRecord>;
  /** İçerik günceller; approved→pending ise aggregate yeniden hesaplanır (aynı tx). */
  updateOwnReview(
    storeId: string,
    id: string,
    input: { rating: number; title: string | null; body: string; backToPending: boolean },
  ): Promise<ReviewRecord>;
  listCustomerReviews(storeId: string, customerId: string): Promise<ReviewRecord[]>;

  // ── Public okuma ───────────────────────────────────────────────────────
  getAggregate(storeId: string, productId: string): Promise<AggregateRecord | null>;
  getAggregatesByProductIds(storeId: string, productIds: string[]): Promise<AggregateRecord[]>;
  listApprovedReviews(
    storeId: string,
    productId: string,
    options: PublicListOptions,
  ): Promise<{ items: ReviewRecord[]; total: number }>;

  // ── Helpful ───────────────────────────────────────────────────────────
  findViewerHelpfulSet(
    reviewIds: string[],
    customerId: string,
  ): Promise<Set<string>>;
  hasViewerHelpful(reviewId: string, customerId: string): Promise<boolean>;
  toggleHelpful(
    storeId: string,
    reviewId: string,
    customerId: string,
    desired: boolean,
  ): Promise<{ helpful: boolean; helpfulCount: number }>;

  // ── Admin ───────────────────────────────────────────────────────────────
  listAdminReviews(
    storeId: string,
    filters: AdminReviewFilters,
  ): Promise<{ items: ReviewRecord[]; total: number }>;
  moderateReview(
    storeId: string,
    id: string,
    nextStatus: ProductReviewStatus,
    moderationNote: string | null,
  ): Promise<ReviewRecord | null>;

  // ── Ortak yardımcılar ─────────────────────────────────────────────────
  findProductInfoByIds(storeId: string, ids: string[]): Promise<Map<string, ReviewProductInfo>>;
  findCustomerNamesByIds(
    storeId: string,
    ids: string[],
  ): Promise<Map<string, { firstName: string | null; lastName: string | null; email: string | null }>>;
  findOrderNumbersByIds(storeId: string, ids: string[]): Promise<Map<string, string>>;
}

const REVIEW_SELECT = {
  id: true,
  storeId: true,
  productId: true,
  variantId: true,
  customerId: true,
  orderId: true,
  orderLineId: true,
  rating: true,
  title: true,
  body: true,
  status: true,
  verifiedPurchase: true,
  helpfulCount: true,
  moderationNote: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function toRecord(row: Record<string, unknown>): ReviewRecord {
  return row as unknown as ReviewRecord;
}

/**
 * SAF aggregate hesabı (yıldız→sayı → toplamlar). Tamsayı toplamlar float drift'i
 * imkânsız kılar. `averageTimes100 = round(sumRating*100/reviewCount)`. DB'siz test edilebilir.
 */
export function computeAggregate(counts: {
  1: number;
  2: number;
  3: number;
  4: number;
  5: number;
}): {
  reviewCount: number;
  sumRating: number;
  averageTimes100: number;
  count1: number;
  count2: number;
  count3: number;
  count4: number;
  count5: number;
} {
  let reviewCount = 0;
  let sumRating = 0;
  for (const star of [1, 2, 3, 4, 5] as const) {
    reviewCount += counts[star];
    sumRating += star * counts[star];
  }
  const averageTimes100 = reviewCount === 0 ? 0 : Math.round((sumRating * 100) / reviewCount);
  return {
    reviewCount,
    sumRating,
    averageTimes100,
    count1: counts[1],
    count2: counts[2],
    count3: counts[3],
    count4: counts[4],
    count5: counts[5],
  };
}

/** averageTimes100 → 1 ondalıklı gösterim ortalaması (TEK otorite; routes bunu kullanır). */
export function displayAverage(averageTimes100: number): number {
  return Math.round(averageTimes100 / 10) / 10;
}

/**
 * Aggregate'i SIFIRDAN yeniden hesaplar (yalnız APPROVED yorumlar üzerinde groupBy).
 * Delta aritmetiği YOK → daima tutarlı. reviewCount=0 ise satır silinir (batched summary
 * yalnız var olan satırları döndürür → yorumu olmayan ürün "değerlendirme yok"). TEK yazma yolu.
 */
export async function recomputeAggregate(
  tx: TransactionClient,
  storeId: string,
  productId: string,
): Promise<void> {
  const grouped = await tx.productReview.groupBy({
    by: ["rating"],
    where: { storeId, productId, status: "APPROVED" },
    _count: { _all: true },
  });
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>;
  for (const g of grouped) {
    counts[g.rating as 1 | 2 | 3 | 4 | 5] = g._count._all;
  }
  const agg = computeAggregate(counts);
  if (agg.reviewCount === 0) {
    await tx.productRatingAggregate.deleteMany({ where: { productId } });
    return;
  }
  const payload = { storeId, ...agg };
  await tx.productRatingAggregate.upsert({
    where: { productId },
    create: { productId, ...payload },
    update: payload,
  });
}

export function createReviewData(): ReviewData {
  return {
    async listEligibleLines(storeId, customerId) {
      const rows = await prisma.orderLine.findMany({
        where: {
          storeId,
          review: null,
          order: {
            customerId,
            status: { not: "CANCELLED" },
            paymentStatus: "PAID",
            OR: [{ fulfillmentStatus: "FULFILLED" }, { shipments: { some: { status: "DELIVERED" } } }],
          },
          product: { reviews: { none: { customerId } } },
        },
        select: {
          id: true,
          orderId: true,
          productId: true,
          variantId: true,
          variantTitle: true,
          order: { select: { orderNumber: true, placedAt: true, createdAt: true } },
          product: { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      const seen = new Set<string>();
      const out: EligibleLine[] = [];
      for (const r of rows) {
        if (seen.has(r.productId)) continue;
        seen.add(r.productId);
        out.push({
          orderLineId: r.id,
          orderId: r.orderId,
          orderNumber: r.order.orderNumber,
          productId: r.productId,
          productTitle: r.product.title,
          productSlug: r.product.slug,
          variantId: r.variantId,
          variantLabel: r.variantTitle || null,
          purchasedAt: r.order.placedAt ?? r.order.createdAt,
        });
      }
      return out;
    },

    async findEligibleLineForProduct(storeId, customerId, productId) {
      const r = await prisma.orderLine.findFirst({
        where: {
          storeId,
          productId,
          review: null,
          order: {
            customerId,
            status: { not: "CANCELLED" },
            paymentStatus: "PAID",
            OR: [{ fulfillmentStatus: "FULFILLED" }, { shipments: { some: { status: "DELIVERED" } } }],
          },
        },
        select: {
          id: true,
          orderId: true,
          productId: true,
          variantId: true,
          variantTitle: true,
          order: { select: { orderNumber: true, placedAt: true, createdAt: true } },
          product: { select: { title: true, slug: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      if (!r) return null;
      return {
        orderLineId: r.id,
        orderId: r.orderId,
        orderNumber: r.order.orderNumber,
        productId: r.productId,
        productTitle: r.product.title,
        productSlug: r.product.slug,
        variantId: r.variantId,
        variantLabel: r.variantTitle || null,
        purchasedAt: r.order.placedAt ?? r.order.createdAt,
      };
    },

    async resolveEligibleLineById(storeId, customerId, orderLineId) {
      const r = await prisma.orderLine.findFirst({
        where: {
          id: orderLineId,
          storeId,
          review: null,
          order: {
            customerId,
            status: { not: "CANCELLED" },
            paymentStatus: "PAID",
            OR: [{ fulfillmentStatus: "FULFILLED" }, { shipments: { some: { status: "DELIVERED" } } }],
          },
        },
        select: {
          id: true,
          orderId: true,
          productId: true,
          variantId: true,
          variantTitle: true,
          order: { select: { orderNumber: true, placedAt: true, createdAt: true } },
          product: { select: { title: true, slug: true } },
        },
      });
      if (!r) return null;
      return {
        orderLineId: r.id,
        orderId: r.orderId,
        orderNumber: r.order.orderNumber,
        productId: r.productId,
        productTitle: r.product.title,
        productSlug: r.product.slug,
        variantId: r.variantId,
        variantLabel: r.variantTitle || null,
        purchasedAt: r.order.placedAt ?? r.order.createdAt,
      };
    },

    async findReviewById(storeId, id) {
      const row = await prisma.productReview.findFirst({
        where: { id, storeId },
        select: REVIEW_SELECT,
      });
      return row ? toRecord(row) : null;
    },

    async findOwnReview(storeId, customerId, id) {
      const row = await prisma.productReview.findFirst({
        where: { id, storeId, customerId },
        select: REVIEW_SELECT,
      });
      return row ? toRecord(row) : null;
    },

    async findReviewByProductCustomer(storeId, productId, customerId) {
      const row = await prisma.productReview.findFirst({
        where: { storeId, productId, customerId },
        select: REVIEW_SELECT,
      });
      return row ? toRecord(row) : null;
    },

    async createReview(input) {
      const row = await prisma.productReview.create({
        data: {
          storeId: input.storeId,
          productId: input.productId,
          variantId: input.variantId,
          customerId: input.customerId,
          orderId: input.orderId,
          orderLineId: input.orderLineId,
          rating: input.rating,
          title: input.title,
          body: input.body,
          status: "PENDING",
          verifiedPurchase: true,
        },
        select: REVIEW_SELECT,
      });
      return toRecord(row);
    },

    async updateOwnReview(storeId, id, input) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.productReview.findFirst({
          where: { id, storeId },
          select: { productId: true, status: true },
        });
        if (!existing) throw new Error("review-not-found");
        const wasApproved = existing.status === "APPROVED";
        const nextStatus = input.backToPending && wasApproved ? "PENDING" : undefined;
        const row = await tx.productReview.update({
          where: { id },
          data: {
            rating: input.rating,
            title: input.title,
            body: input.body,
            ...(nextStatus ? { status: nextStatus, publishedAt: null } : {}),
          },
          select: REVIEW_SELECT,
        });
        // Approved iken düzenlenip PENDING'e döndüyse aggregate'ten çıkar (yeniden hesap).
        if (wasApproved) {
          await recomputeAggregate(tx, storeId, existing.productId);
        }
        return toRecord(row);
      });
    },

    async listCustomerReviews(storeId, customerId) {
      const rows = await prisma.productReview.findMany({
        where: { storeId, customerId },
        select: REVIEW_SELECT,
        orderBy: { createdAt: "desc" },
      });
      return rows.map(toRecord);
    },

    async getAggregate(storeId, productId) {
      const row = await prisma.productRatingAggregate.findFirst({
        where: { productId, storeId },
      });
      return (row as AggregateRecord) ?? null;
    },

    async getAggregatesByProductIds(storeId, productIds) {
      if (productIds.length === 0) return [];
      const rows = await prisma.productRatingAggregate.findMany({
        where: { storeId, productId: { in: productIds } },
      });
      return rows as AggregateRecord[];
    },

    async listApprovedReviews(storeId, productId, options) {
      const where: Prisma.ProductReviewWhereInput = {
        storeId,
        productId,
        status: "APPROVED",
        ...(options.rating ? { rating: options.rating } : {}),
      };
      const orderBy = ((): Prisma.ProductReviewOrderByWithRelationInput[] => {
        switch (options.sort) {
          case "oldest":
            return [{ publishedAt: "asc" }, { createdAt: "asc" }];
          case "highest":
            return [{ rating: "desc" }, { publishedAt: "desc" }];
          case "lowest":
            return [{ rating: "asc" }, { publishedAt: "desc" }];
          case "most_helpful":
            return [{ helpfulCount: "desc" }, { publishedAt: "desc" }];
          case "newest":
          default:
            return [{ publishedAt: "desc" }, { createdAt: "desc" }];
        }
      })();
      const [items, total] = await Promise.all([
        prisma.productReview.findMany({
          where,
          select: REVIEW_SELECT,
          orderBy,
          skip: options.offset,
          take: options.limit,
        }),
        prisma.productReview.count({ where }),
      ]);
      return { items: items.map(toRecord), total };
    },

    async findViewerHelpfulSet(reviewIds, customerId) {
      if (reviewIds.length === 0) return new Set();
      const rows = await prisma.productReviewHelpful.findMany({
        where: { customerId, reviewId: { in: reviewIds } },
        select: { reviewId: true },
      });
      return new Set(rows.map((r) => r.reviewId));
    },

    async hasViewerHelpful(reviewId, customerId) {
      const row = await prisma.productReviewHelpful.findFirst({
        where: { reviewId, customerId },
        select: { id: true },
      });
      return row !== null;
    },

    async toggleHelpful(storeId, reviewId, customerId, desired) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.productReviewHelpful.findFirst({
          where: { reviewId, customerId },
          select: { id: true },
        });
        if (desired && !existing) {
          try {
            await tx.productReviewHelpful.create({
              data: { storeId, reviewId, customerId },
            });
            const updated = await tx.productReview.update({
              where: { id: reviewId },
              data: { helpfulCount: { increment: 1 } },
              select: { helpfulCount: true },
            });
            return { helpful: true, helpfulCount: updated.helpfulCount };
          } catch (error) {
            if (isUniqueViolation(error)) {
              const r = await tx.productReview.findUnique({
                where: { id: reviewId },
                select: { helpfulCount: true },
              });
              return { helpful: true, helpfulCount: r?.helpfulCount ?? 0 };
            }
            throw error;
          }
        }
        if (!desired && existing) {
          await tx.productReviewHelpful.delete({ where: { id: existing.id } });
          const updated = await tx.productReview.update({
            where: { id: reviewId },
            data: { helpfulCount: { decrement: 1 } },
            select: { helpfulCount: true },
          });
          return { helpful: false, helpfulCount: Math.max(0, updated.helpfulCount) };
        }
        // İstenen durum zaten geçerli (idempotent) — mevcut sayacı döndür.
        const r = await tx.productReview.findUnique({
          where: { id: reviewId },
          select: { helpfulCount: true },
        });
        return { helpful: existing !== null, helpfulCount: r?.helpfulCount ?? 0 };
      });
    },

    async listAdminReviews(storeId, filters) {
      const where: Prisma.ProductReviewWhereInput = {
        storeId,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.rating ? { rating: filters.rating } : {}),
        ...(filters.verifiedPurchase !== undefined
          ? { verifiedPurchase: filters.verifiedPurchase }
          : {}),
        ...(filters.productId ? { productId: filters.productId } : {}),
        ...(filters.dateFrom || filters.dateTo
          ? {
              createdAt: {
                ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
                ...(filters.dateTo ? { lte: filters.dateTo } : {}),
              },
            }
          : {}),
        ...(filters.search
          ? {
              OR: [
                { title: { contains: filters.search, mode: "insensitive" } },
                { body: { contains: filters.search, mode: "insensitive" } },
              ],
            }
          : {}),
      };
      const sortBy = filters.sortBy ?? "createdAt";
      const sortOrder = filters.sortOrder ?? "desc";
      const orderBy: Prisma.ProductReviewOrderByWithRelationInput =
        sortBy === "rating"
          ? { rating: sortOrder }
          : sortBy === "status"
            ? { status: sortOrder }
            : sortBy === "helpfulCount"
              ? { helpfulCount: sortOrder }
              : { createdAt: sortOrder };
      const [items, total] = await Promise.all([
        prisma.productReview.findMany({
          where,
          select: REVIEW_SELECT,
          orderBy,
          skip: filters.offset,
          take: filters.limit,
        }),
        prisma.productReview.count({ where }),
      ]);
      return { items: items.map(toRecord), total };
    },

    async moderateReview(storeId, id, nextStatus, moderationNote) {
      return prisma.$transaction(async (tx) => {
        const existing = await tx.productReview.findFirst({
          where: { id, storeId },
          select: { productId: true, status: true },
        });
        if (!existing) return null;
        const becomesApproved = nextStatus === "APPROVED";
        const row = await tx.productReview.update({
          where: { id },
          data: {
            status: nextStatus,
            moderationNote: moderationNote,
            publishedAt: becomesApproved ? new Date() : null,
          },
          select: REVIEW_SELECT,
        });
        // APPROVED'a giriş VEYA çıkış aggregate'i değiştirir → yeniden hesap.
        if (becomesApproved || existing.status === "APPROVED") {
          await recomputeAggregate(tx, storeId, existing.productId);
        }
        return toRecord(row);
      });
    },

    async findProductInfoByIds(storeId, ids) {
      const map = new Map<string, ReviewProductInfo>();
      const unique = [...new Set(ids)];
      if (unique.length === 0) return map;
      const rows = await prisma.product.findMany({
        where: { storeId, id: { in: unique } },
        select: { id: true, title: true, slug: true },
      });
      for (const r of rows) map.set(r.id, r);
      return map;
    },

    async findCustomerNamesByIds(storeId, ids) {
      const map = new Map<
        string,
        { firstName: string | null; lastName: string | null; email: string | null }
      >();
      const unique = [...new Set(ids)];
      if (unique.length === 0) return map;
      const rows = await prisma.customer.findMany({
        where: { storeId, id: { in: unique } },
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      for (const r of rows) {
        map.set(r.id, { firstName: r.firstName, lastName: r.lastName, email: r.email });
      }
      return map;
    },

    async findOrderNumbersByIds(storeId, ids) {
      const map = new Map<string, string>();
      const unique = [...new Set(ids)];
      if (unique.length === 0) return map;
      const rows = await prisma.order.findMany({
        where: { storeId, id: { in: unique } },
        select: { id: true, orderNumber: true },
      });
      for (const r of rows) map.set(r.id, r.orderNumber);
      return map;
    },
  };
}
