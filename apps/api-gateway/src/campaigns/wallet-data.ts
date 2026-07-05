/**
 * F4A.3 — Musteri kupon cuzdani (wallet) veri erisimi (ADR-060).
 *
 * Tum sorgular STORE-SCOPED'tur; baska magazanin kuponu/atamasi gorunmez ve
 * atanamaz/claim edilemez. Bu katman yalnizca cuzdan/atama STATE'ini yonetir;
 * indirim tutari yine couponCode + motordan gelir. Siparis-zamani USED isaretleme
 * F4A siparis transaction'i icinde (applyOrderDiscountsInTransaction yaninda) yapilir.
 */
import { prisma } from "@commerce-os/db";
import type { Prisma } from "@prisma/client";
import type {
  CustomerCouponSource,
  CustomerCouponStatus,
  PublicWalletCouponSource,
} from "@commerce-os/contracts";
import { campaignInclude, maskEmail, toCampaignRecord } from "./data.js";
import type { CampaignCouponRecord, CampaignRecord } from "./data.js";
import { normalizeCouponCode } from "./discount-engine.js";

/** Kupon + bagli kampanya kaydi (cuzdan projeksiyonu icin). */
export interface CouponWithCampaign {
  coupon: CampaignCouponRecord;
  campaign: CampaignRecord;
}

/** Kimlik (oturum acmis musteri veya email) icin cuzdan adayi. */
export interface WalletEntryCandidate extends CouponWithCampaign {
  status: CustomerCouponStatus;
  source: PublicWalletCouponSource;
}

/**
 * F4A.5 — Kupon merkezi "Kullanıldı" gecmisi icin USED cuzdan satiri. Yalnizca
 * kimligin KENDI kullanimi; siparis numarasi bu musterinin siparisidir (sizinti YOK).
 */
export interface WalletUsedEntry extends CouponWithCampaign {
  source: PublicWalletCouponSource;
  usedAt: Date | null;
  orderNumber: string | null;
}

/** Admin cuzdan/atama kaydi (serialize edilmemis; e-posta ham). */
export interface WalletAssignmentRecord {
  id: string;
  couponId: string;
  couponCode: string;
  campaignId: string;
  campaignName: string;
  customerId: string | null;
  customerName: string | null;
  email: string | null;
  status: CustomerCouponStatus;
  source: CustomerCouponSource;
  claimedAt: Date;
  appliedAt: Date | null;
  usedAt: Date | null;
  orderId: string | null;
  orderNumber: string | null;
}

export type WalletAssignError = "COUPON_NOT_FOUND" | "CUSTOMER_NOT_FOUND";

const walletInclude = {
  coupon: true,
  campaign: { include: campaignInclude },
  customer: { select: { firstName: true, lastName: true, email: true } },
  order: { select: { orderNumber: true } },
} satisfies Prisma.CustomerCouponInclude;

type WalletRow = Prisma.CustomerCouponGetPayload<{ include: typeof walletInclude }>;

function couponRecord(row: WalletRow["coupon"]): CampaignCouponRecord {
  return {
    id: row.id,
    code: row.code,
    normalizedCode: row.normalizedCode,
    status: row.status,
    totalUsageLimit: row.totalUsageLimit,
    perCustomerUsageLimit: row.perCustomerUsageLimit,
    usageCount: row.usageCount,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Admin listeleme kaydina cevirir (e-posta MASKELI). */
function toAssignmentRecord(row: WalletRow): WalletAssignmentRecord {
  const name = [row.customer?.firstName, row.customer?.lastName].filter(Boolean).join(" ").trim();
  return {
    id: row.id,
    couponId: row.couponId,
    couponCode: row.coupon.code,
    campaignId: row.campaignId,
    campaignName: row.campaign.name,
    customerId: row.customerId,
    customerName: name.length > 0 ? name : null,
    email: maskEmail(row.email ?? row.customer?.email ?? null),
    status: row.status,
    source: row.source,
    claimedAt: row.claimedAt,
    appliedAt: row.appliedAt,
    usedAt: row.usedAt,
    orderId: row.orderId,
    orderNumber: row.order?.orderNumber ?? null,
  };
}

/** ADMIN_ASSIGNED -> ASSIGNED; digerleri -> CLAIMED (public kaynak ayri hesaplanir). */
function sourceToPublic(source: CustomerCouponSource): PublicWalletCouponSource {
  return source === "ADMIN_ASSIGNED" ? "ASSIGNED" : "CLAIMED";
}

export interface WalletDataAccess {
  /** Kod ile kupon+kampanya (store-scoped). Bulunamazsa null. */
  findCouponWithCampaignByCode(
    storeId: string,
    normalizedCode: string,
  ): Promise<CouponWithCampaign | null>;
  /** Birden cok normalize kod -> kupon+kampanya (misafir cookie claim'leri icin). */
  resolveCouponsWithCampaignByCodes(
    storeId: string,
    normalizedCodes: string[],
  ): Promise<CouponWithCampaign[]>;
  /** Kimlik (customerId veya email) icin cuzdan adaylari (AVAILABLE/APPLIED). */
  listWalletEntriesForIdentity(
    storeId: string,
    identity: { customerId: string | null; email: string | null },
  ): Promise<WalletEntryCandidate[]>;
  /** F4A.5 — Kimlik icin USED cuzdan gecmisi (kupon merkezi "Kullanıldı"). */
  listUsedWalletEntriesForIdentity(
    storeId: string,
    identity: { customerId: string | null; email: string | null },
  ): Promise<WalletUsedEntry[]>;
  /** Kupon claim'i cuzdana ekler (oturum acmis musteri/email); idempotent upsert. */
  upsertClaim(
    storeId: string,
    input: {
      couponId: string;
      campaignId: string;
      customerId: string | null;
      email: string | null;
      source: CustomerCouponSource;
    },
  ): Promise<void>;
  /** Admin atama (couponId + customerId veya email). Store/cross-store dogrular. */
  assignCoupon(
    storeId: string,
    input: { couponId: string; customerId: string | null; email: string | null },
  ): Promise<WalletAssignmentRecord | WalletAssignError>;
  listCampaignAssignments(storeId: string, campaignId: string): Promise<WalletAssignmentRecord[]>;
  listCustomerAssignments(storeId: string, customerId: string): Promise<WalletAssignmentRecord[]>;
  /** "Kullan"/"Kaldir": kimlige ait cuzdan satirini APPLIED/AVAILABLE yapar. */
  setAppliedForIdentity(
    storeId: string,
    input: { normalizedCode: string; customerId: string | null; email: string | null },
    applied: boolean,
  ): Promise<void>;
}

export function createPrismaWalletDataAccess(): WalletDataAccess {
  return {
    findCouponWithCampaignByCode: async (storeId, normalizedCode) => {
      const row = await prisma.coupon.findUnique({
        where: { storeId_normalizedCode: { storeId, normalizedCode } },
        include: { campaign: { include: campaignInclude } },
      });
      if (!row || row.storeId !== storeId || row.campaign.storeId !== storeId) return null;
      return { coupon: couponRecord(row), campaign: toCampaignRecord(row.campaign) };
    },
    resolveCouponsWithCampaignByCodes: async (storeId, normalizedCodes) => {
      const unique = [...new Set(normalizedCodes.filter((code) => code.length > 0))];
      if (unique.length === 0) return [];
      const rows = await prisma.coupon.findMany({
        where: { storeId, normalizedCode: { in: unique } },
        include: { campaign: { include: campaignInclude } },
      });
      return rows
        .filter((row) => row.campaign.storeId === storeId)
        .map((row) => ({ coupon: couponRecord(row), campaign: toCampaignRecord(row.campaign) }));
    },
    listWalletEntriesForIdentity: async (storeId, identity) => {
      const filters: Prisma.CustomerCouponWhereInput[] = [];
      if (identity.customerId) filters.push({ customerId: identity.customerId });
      if (identity.email) filters.push({ email: identity.email });
      if (filters.length === 0) return [];
      const rows = await prisma.customerCoupon.findMany({
        where: { storeId, status: { in: ["AVAILABLE", "APPLIED"] }, OR: filters },
        include: walletInclude,
      });
      return rows
        .filter((row) => row.campaign.storeId === storeId)
        .map((row) => ({
          coupon: couponRecord(row.coupon),
          campaign: toCampaignRecord(row.campaign),
          status: row.status,
          source: sourceToPublic(row.source),
        }));
    },
    listUsedWalletEntriesForIdentity: async (storeId, identity) => {
      const filters: Prisma.CustomerCouponWhereInput[] = [];
      if (identity.customerId) filters.push({ customerId: identity.customerId });
      if (identity.email) filters.push({ email: identity.email });
      if (filters.length === 0) return [];
      const rows = await prisma.customerCoupon.findMany({
        where: { storeId, status: "USED", OR: filters },
        orderBy: { usedAt: "desc" },
        include: walletInclude,
      });
      return rows
        .filter((row) => row.campaign.storeId === storeId)
        .map((row) => ({
          coupon: couponRecord(row.coupon),
          campaign: toCampaignRecord(row.campaign),
          source: sourceToPublic(row.source),
          usedAt: row.usedAt,
          orderNumber: row.order?.orderNumber ?? null,
        }));
    },
    upsertClaim: async (storeId, input) => {
      // customerId varsa customer-anahtarli, yoksa email-anahtarli tekil satir.
      if (input.customerId) {
        await prisma.customerCoupon.upsert({
          where: {
            storeId_couponId_customerId: {
              storeId,
              couponId: input.couponId,
              customerId: input.customerId,
            },
          },
          create: {
            storeId,
            couponId: input.couponId,
            campaignId: input.campaignId,
            customerId: input.customerId,
            email: input.email,
            source: input.source,
            status: "AVAILABLE",
          },
          // Var olan REVOKED/USED satiri claim ile yeniden AVAILABLE yapilmaz;
          // yalniz kaynak/email bilgisi guncellenir (idempotent). Durum degistirilmez.
          update: { email: input.email ?? undefined },
        });
      } else if (input.email) {
        await prisma.customerCoupon.upsert({
          where: {
            storeId_couponId_email: { storeId, couponId: input.couponId, email: input.email },
          },
          create: {
            storeId,
            couponId: input.couponId,
            campaignId: input.campaignId,
            email: input.email,
            source: input.source,
            status: "AVAILABLE",
          },
          update: {},
        });
      }
    },
    assignCoupon: async (storeId, input) => {
      const coupon = await prisma.coupon.findFirst({
        where: { id: input.couponId, storeId },
        select: { id: true, campaignId: true },
      });
      if (!coupon) return "COUPON_NOT_FOUND";

      const customerId = input.customerId ?? null;
      let email = input.email ?? null;
      if (customerId) {
        const customer = await prisma.customer.findFirst({
          where: { id: customerId, storeId },
          select: { id: true, email: true },
        });
        if (!customer) return "CUSTOMER_NOT_FOUND";
        // Musteri email'i biliniyorsa email de doldurulur (misafir sepet eslemesi icin).
        email = email ?? customer.email ?? null;
      }

      const row = await prisma.customerCoupon.upsert({
        where: customerId
          ? { storeId_couponId_customerId: { storeId, couponId: coupon.id, customerId } }
          : { storeId_couponId_email: { storeId, couponId: coupon.id, email: email! } },
        create: {
          storeId,
          couponId: coupon.id,
          campaignId: coupon.campaignId,
          customerId,
          email,
          source: "ADMIN_ASSIGNED",
          status: "AVAILABLE",
        },
        // Zaten atanmis/claim edilmis satir varsa kaynak ADMIN_ASSIGNED'a yukseltilir
        // ve REVOKED ise yeniden AVAILABLE yapilir (USED tarihsel kalir).
        update: {
          source: "ADMIN_ASSIGNED",
          email: email ?? undefined,
        },
        include: walletInclude,
      });
      if (row.status === "REVOKED") {
        await prisma.customerCoupon.update({
          where: { id: row.id },
          data: { status: "AVAILABLE" },
        });
        row.status = "AVAILABLE";
      }
      return toAssignmentRecord(row);
    },
    listCampaignAssignments: async (storeId, campaignId) => {
      const rows = await prisma.customerCoupon.findMany({
        where: { storeId, campaignId },
        orderBy: { claimedAt: "desc" },
        include: walletInclude,
      });
      return rows.map(toAssignmentRecord);
    },
    listCustomerAssignments: async (storeId, customerId) => {
      const rows = await prisma.customerCoupon.findMany({
        where: { storeId, customerId },
        orderBy: { claimedAt: "desc" },
        include: walletInclude,
      });
      return rows.map(toAssignmentRecord);
    },
    setAppliedForIdentity: async (storeId, input, applied) => {
      const filters: Prisma.CustomerCouponWhereInput[] = [];
      if (input.customerId) filters.push({ customerId: input.customerId });
      if (input.email) filters.push({ email: input.email });
      if (filters.length === 0) return;
      const coupon = await prisma.coupon.findUnique({
        where: { storeId_normalizedCode: { storeId, normalizedCode: input.normalizedCode } },
        select: { id: true },
      });
      if (!coupon) return;
      if (applied) {
        // MVP: sepet basina TEK APPLIED — kimligin diger APPLIED satirlari AVAILABLE'a doner.
        await prisma.customerCoupon.updateMany({
          where: { storeId, status: "APPLIED", OR: filters },
          data: { status: "AVAILABLE", appliedAt: null },
        });
        await prisma.customerCoupon.updateMany({
          where: { storeId, couponId: coupon.id, status: "AVAILABLE", OR: filters },
          data: { status: "APPLIED", appliedAt: new Date() },
        });
      } else {
        await prisma.customerCoupon.updateMany({
          where: { storeId, couponId: coupon.id, status: "APPLIED", OR: filters },
          data: { status: "AVAILABLE", appliedAt: null },
        });
      }
    },
  };
}

export { normalizeCouponCode };
