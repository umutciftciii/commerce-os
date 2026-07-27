/**
 * TD-131 (ADR-149…155) — Customer Data Erasure veri erişim katmanı (ham Prisma).
 *
 * TÜM sorgular tenant-izole: `where: { storeId, customerId }`. Başka mağazanın aynı
 * e-posta/telefonlu müşterisi ETKİLENMEZ (cross-store guard yapısaldır). Guest
 * (visitorHash) event'lerine DOKUNULMAZ (yalnız customerId eşleşen satırlar).
 *
 * `applyErasure` TEK transaction'da çalışır (yarım silme yok) ve durumu KİLİT
 * ALTINDA yeniden okur (already-erased idempotency). Kilit servis katmanında
 * (advisory lock) transaction'ı sarar.
 */
import type { CustomerStatus, PrismaClient } from "@prisma/client";
import { prisma } from "@commerce-os/db";
import {
  ANONYMIZED_ADDRESS_LINE,
  ANONYMIZED_FULL_NAME,
  buildCustomerAnonymization,
  emptyDeleteCounts,
  erasedEmailPlaceholder,
  type CustomerAnonymizationData,
  type ErasureDeleteCounts,
} from "./core.js";

export interface CustomerErasureState {
  status: CustomerStatus;
  erasedAt: Date | null;
  erasedByUserId: string | null;
  eraseReason: string | null;
}

export interface ErasureAnonymizeCounts {
  orders: number;
  orderAddresses: number;
  campaignRedemptions: number;
}

export interface ErasurePreserveCounts {
  orders: number;
  orderLines: number;
  payments: number;
  campaignRedemptions: number;
}

export interface CustomerErasurePreviewData extends CustomerErasureState {
  activeSessionCount: number;
  openOrderCount: number;
  deleteCounts: ErasureDeleteCounts;
  anonymizeCounts: ErasureAnonymizeCounts;
  preserveCounts: ErasurePreserveCounts;
  reviewAnonymizeCount: number;
}

export interface ApplyErasurePlan {
  actorUserId: string;
  reason: string;
  now: Date;
}

export type ApplyErasureResult =
  | { kind: "NOT_FOUND" }
  | { kind: "ALREADY_ERASED"; state: CustomerErasureState }
  | {
      kind: "ERASED";
      deleted: ErasureDeleteCounts;
      anonymized: ErasureAnonymizeCounts;
      reviewAnonymizeCount: number;
      erasedAt: Date;
    };

export type DeactivateResult =
  | { kind: "NOT_FOUND" }
  | { kind: "ALREADY_ERASED" }
  | { kind: "DEACTIVATED"; revokedCount: number };

export interface CustomerErasureData {
  findState(storeId: string, customerId: string): Promise<CustomerErasureState | null>;
  preview(storeId: string, customerId: string): Promise<CustomerErasurePreviewData | null>;
  applyErasure(storeId: string, customerId: string, plan: ApplyErasurePlan): Promise<ApplyErasureResult>;
  deactivate(storeId: string, customerId: string): Promise<DeactivateResult>;
}

export function createCustomerErasureData(db: PrismaClient = prisma): CustomerErasureData {
  async function findState(storeId: string, customerId: string): Promise<CustomerErasureState | null> {
    return db.customer.findFirst({
      where: { id: customerId, storeId },
      select: { status: true, erasedAt: true, erasedByUserId: true, eraseReason: true },
    });
  }

  return {
    findState,

    async preview(storeId, customerId) {
      const state = await findState(storeId, customerId);
      if (!state) return null;

      const scope = { storeId, customerId };
      const [
        sessions,
        activeSessionCount,
        credentials,
        credentialTokens,
        otpVerifications,
        ibans,
        communicationPreferences,
        addresses,
        coupons,
        lists,
        listItems,
        reviewHelpfulVotes,
        recentlyViewed,
        recommendationEvents,
        orders,
        openOrderCount,
        orderAddresses,
        campaignRedemptions,
        orderLines,
        payments,
        reviewAnonymizeCount,
      ] = await Promise.all([
        db.customerSession.count({ where: scope }),
        db.customerSession.count({ where: { ...scope, revokedAt: null, expiresAt: { gt: new Date() } } }),
        db.customerCredential.count({ where: scope }),
        db.customerCredentialToken.count({ where: scope }),
        db.customerOtpVerification.count({ where: scope }),
        db.customerIban.count({ where: scope }),
        db.customerCommunicationPreference.count({ where: scope }),
        db.customerAddress.count({ where: scope }),
        db.customerCoupon.count({ where: scope }),
        db.customerList.count({ where: scope }),
        db.customerListItem.count({ where: { storeId, list: { customerId } } }),
        db.productReviewHelpful.count({ where: scope }),
        db.recentlyViewedProduct.count({ where: scope }),
        db.recommendationEvent.count({ where: scope }),
        db.order.count({ where: scope }),
        db.order.count({ where: { ...scope, status: { in: ["PLACED", "CONFIRMED"] } } }),
        db.orderAddress.count({ where: { storeId, order: { customerId } } }),
        db.campaignRedemption.count({ where: scope }),
        db.orderLine.count({ where: { storeId, order: { customerId } } }),
        db.paymentAttempt.count({ where: { storeId, order: { customerId } } }),
        db.productReview.count({ where: scope }),
      ]);

      const deleteCounts: ErasureDeleteCounts = {
        sessions,
        credentials,
        credentialTokens,
        otpVerifications,
        ibans,
        communicationPreferences,
        addresses,
        coupons,
        lists,
        listItems,
        reviewHelpfulVotes,
        recentlyViewed,
        recommendationEvents,
      };

      return {
        ...state,
        activeSessionCount,
        openOrderCount,
        deleteCounts,
        anonymizeCounts: { orders, orderAddresses, campaignRedemptions },
        preserveCounts: { orders, orderLines, payments, campaignRedemptions },
        reviewAnonymizeCount,
      };
    },

    async applyErasure(storeId, customerId, plan) {
      return db.$transaction(async (tx) => {
        // Kilit ALTINDA ikinci okuma (already-erased idempotency + cross-store guard).
        const current = await tx.customer.findFirst({
          where: { id: customerId, storeId },
          select: { status: true, erasedAt: true, erasedByUserId: true, eraseReason: true },
        });
        if (!current) return { kind: "NOT_FOUND" };
        if (current.status === "ERASED") {
          return { kind: "ALREADY_ERASED", state: current };
        }

        const scope = { storeId, customerId };
        const deleted = emptyDeleteCounts();

        // 1) FK'siz davranış event'i (Cascade kapsamaz) — yalnız customerId eşleşen.
        deleted.recommendationEvents = (
          await tx.recommendationEvent.deleteMany({ where: scope })
        ).count;
        // 2) Görüntüleme geçmişi (guest visitorHash satırları DOKUNULMAZ).
        deleted.recentlyViewed = (await tx.recentlyViewedProduct.deleteMany({ where: scope })).count;

        // 3) "Faydalı" oyları — denormalize helpfulCount tutarlılığı için etkilenen
        //    yorumların sayacını düş (başka müşterilerin yorumları da etkilenir).
        const votes = await tx.productReviewHelpful.findMany({
          where: scope,
          select: { reviewId: true },
        });
        deleted.reviewHelpfulVotes = (await tx.productReviewHelpful.deleteMany({ where: scope })).count;
        const perReview = new Map<string, number>();
        for (const v of votes) perReview.set(v.reviewId, (perReview.get(v.reviewId) ?? 0) + 1);
        for (const [reviewId, n] of perReview) {
          await tx.productReview.update({
            where: { id: reviewId },
            data: { helpfulCount: { decrement: n } },
          });
        }

        // 4) Cüzdan / listeler (item'ları önce açık sil — cascade'e bel bağlama).
        deleted.coupons = (await tx.customerCoupon.deleteMany({ where: scope })).count;
        const listRows = await tx.customerList.findMany({ where: scope, select: { id: true } });
        const listIds = listRows.map((l) => l.id);
        if (listIds.length > 0) {
          deleted.listItems = (
            await tx.customerListItem.deleteMany({ where: { storeId, listId: { in: listIds } } })
          ).count;
        }
        deleted.lists = (await tx.customerList.deleteMany({ where: scope })).count;

        // 5) Kişisel finansal kimlik + iletişim + adres defteri + auth sırları.
        deleted.ibans = (await tx.customerIban.deleteMany({ where: scope })).count;
        deleted.communicationPreferences = (
          await tx.customerCommunicationPreference.deleteMany({ where: scope })
        ).count;
        deleted.addresses = (await tx.customerAddress.deleteMany({ where: scope })).count;
        deleted.otpVerifications = (await tx.customerOtpVerification.deleteMany({ where: scope })).count;
        deleted.credentialTokens = (await tx.customerCredentialToken.deleteMany({ where: scope })).count;
        deleted.sessions = (await tx.customerSession.deleteMany({ where: scope })).count;
        deleted.credentials = (await tx.customerCredential.deleteMany({ where: scope })).count;

        // 6) Sipariş temas PII'si anonimleştir (mali/yasal alanlar KORUNUR).
        const orderRows = await tx.order.findMany({ where: scope, select: { id: true } });
        const orderIds = orderRows.map((o) => o.id);
        let anonymizedOrderAddresses = 0;
        if (orderIds.length > 0) {
          anonymizedOrderAddresses = (
            await tx.orderAddress.updateMany({
              where: { storeId, orderId: { in: orderIds } },
              data: {
                fullName: ANONYMIZED_FULL_NAME,
                phone: null,
                addressLine1: ANONYMIZED_ADDRESS_LINE,
                addressLine2: null,
                district: null,
                postalCode: null,
              },
            })
          ).count;
        }
        const anonymizedOrders = (
          await tx.order.updateMany({
            where: scope,
            data: { customerEmail: erasedEmailPlaceholder(customerId), billingEmail: null },
          })
        ).count;
        const anonymizedRedemptions = (
          await tx.campaignRedemption.updateMany({ where: scope, data: { email: null } })
        ).count;

        // 7) Yorum sayısı (KORU+ANONİM — satır korunur; yazar Customer'dan türer).
        const reviewAnonymizeCount = await tx.productReview.count({ where: scope });

        // 8) Customer satırını anonimleştir + ERASED (terminal) + audit izleri.
        const anonymization: CustomerAnonymizationData = buildCustomerAnonymization({
          customerId,
          now: plan.now,
          actorUserId: plan.actorUserId,
          reason: plan.reason,
        });
        await tx.customer.update({ where: { id: customerId }, data: anonymization });

        return {
          kind: "ERASED",
          deleted,
          anonymized: {
            orders: anonymizedOrders,
            orderAddresses: anonymizedOrderAddresses,
            campaignRedemptions: anonymizedRedemptions,
          },
          reviewAnonymizeCount,
          erasedAt: plan.now,
        };
      }) as Promise<ApplyErasureResult>;
    },

    async deactivate(storeId, customerId) {
      return db.$transaction(async (tx) => {
        const current = await tx.customer.findFirst({
          where: { id: customerId, storeId },
          select: { status: true },
        });
        if (!current) return { kind: "NOT_FOUND" };
        if (current.status === "ERASED") return { kind: "ALREADY_ERASED" };

        const revoked = await tx.customerSession.updateMany({
          where: { storeId, customerId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        await tx.customer.update({ where: { id: customerId }, data: { status: "PASSIVE" } });
        return { kind: "DEACTIVATED", revokedCount: revoked.count };
      }) as Promise<DeactivateResult>;
    },
  };
}
