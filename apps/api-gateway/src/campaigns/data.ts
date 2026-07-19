/**
 * F4A — Kampanya/kupon veri erisimi (ADR-058).
 *
 * Admin CRUD + public indirim baglami (discount context) + siparis transaction'i
 * icinde kullanim (redemption) yazimi. Tum sorgular store-scoped'tur; baska
 * magazanin kampanyasi/kuponu GORUNMEZ ve KULLANILAMAZ.
 *
 * Kullanim limiti es-zamanlilik modeli: siparis olusturma transaction'inda
 * usageCount kosullu updateMany ile artirilir (usageCount < totalUsageLimit
 * satir kosulu atomiktir); kosul tutmazsa siparis reddedilir. Per-customer
 * limit ayni transaction'da redemption COUNT'u ile dogrulanir; siparis basina
 * kampanya tekrarina karsi (campaignId, orderId) unique kisiti son emniyettir.
 */
import { prisma } from "@commerce-os/db";
import type { Prisma } from "@prisma/client";
import type {
  CampaignCreateRequest,
  CampaignDiscountType,
  CampaignResponse,
  CampaignStatus,
  CampaignUpdateRequest,
} from "@commerce-os/contracts";
import { deriveIsPublicFromAccessModel } from "@commerce-os/contracts";
import type { CampaignCouponRecord, CampaignRecord } from "@commerce-os/contracts";
import type { DiscountContext, EngineCampaign, EngineCoupon } from "./discount-engine.js";
import { normalizeCouponCode } from "./discount-engine.js";

type TransactionClient = Prisma.TransactionClient;

// TODO-155.2 — CampaignRecord/CampaignCouponRecord + toCouponDisplayFields artık PAYLAŞILAN pakette
// (@commerce-os/contracts) — search-service ile ortak. Geriye-uyum için buradan RE-EXPORT edilir
// (mevcut `from "./data.js"` içe aktarımları kırılmaz).
export type { CampaignCouponRecord, CampaignRecord } from "@commerce-os/contracts";
export { toCouponDisplayFields } from "@commerce-os/contracts";

export interface CampaignRedemptionRecord {
  id: string;
  orderId: string;
  orderNumber: string | null;
  couponCode: string | null;
  email: string | null;
  discountAmountMinor: number;
  /** F4A.2 — Siparisin genel toplami (siparis kaydindan; yoksa null). */
  orderTotalMinor: number | null;
  createdAt: Date;
}

/**
 * F4A.2 — Kampanya analitigi (ADR-059). KAYNAK DOGRUSU immutable
 * CampaignRedemption + siparis snapshot alanlaridir; guncel kampanya
 * kurallarindan YENIDEN HESAP YAPILMAZ. Iptal/iade edilen siparislerin
 * kullanim kayitlari TARIHSEL olarak dahildir (kompanzasyon deseni yok;
 * ADR-058'deki sinirlamayla tutarli, ADR-059'da dokumante).
 */
export interface CampaignAnalytics {
  redemptionCount: number;
  /** customerId ?? email uzerinden tekillestirilmis musteri sayisi. */
  uniqueCustomerCount: number;
  totalDiscountMinor: number;
  /** Kullanimli siparislerin indirim ONCESI ara toplam (subtotal) toplami. */
  ordersSubtotalMinor: number;
  /** Kullanimli siparislerin tahsil edilen genel toplam (total) toplami. */
  ordersTotalMinor: number;
  avgDiscountPerOrderMinor: number;
  avgOrderTotalMinor: number;
  lastRedemptionAt: Date | null;
}

export interface CampaignDetailRecord extends CampaignRecord {
  recentRedemptions: CampaignRedemptionRecord[];
  totalRedemptionCount: number;
  totalDiscountMinor: number;
  analytics: CampaignAnalytics;
}

/** Siparise yazilacak indirim SNAPSHOT satiri (motor ciktisindan turetilir). */
export interface OrderDiscountInput {
  campaignId: string | null;
  couponId: string | null;
  code: string | null;
  label: string;
  discountType: CampaignDiscountType;
  discountValue: number;
  discountAmountMinor: number;
  scopeSummary?: Record<string, unknown> | null;
}

export type CampaignMutationError =
  | "DUPLICATE_COUPON_CODE"
  | "SCOPE_PRODUCT_NOT_FOUND"
  | "SCOPE_CATEGORY_NOT_FOUND"
  | "ARCHIVED_IMMUTABLE"
  | "INVALID_STATUS_TRANSITION";

export type RedemptionError =
  | "CAMPAIGN_USAGE_LIMIT"
  | "COUPON_USAGE_LIMIT"
  | "CAMPAIGN_NOT_ACTIVE";

/**
 * Siparis transaction'i icinde limit ihlalinde firlatilir: $transaction
 * callback'inden string DONMEK commit'i engellemez; rollback icin throw
 * zorunludur. Cagiran yakalar ve hata kodunu dondurur.
 */
export class CampaignRedemptionRejection extends Error {
  constructor(public readonly code: RedemptionError) {
    super(`Campaign redemption rejected: ${code}`);
    this.name = "CampaignRedemptionRejection";
  }
}

export interface CampaignDataAccess {
  listCampaigns(storeId: string): Promise<CampaignRecord[]>;
  /**
   * F4A.1 — Public vitrin rozet projeksiyonu icin ACTIVE + isPublic kampanyalar
   * (yalniz motorun destekledigi 4 tip). Store-scoped; baska magazanin
   * kampanyasi DONMEZ. Uygunluk/kapsam filtresi cagiran tarafta (saf helper).
   */
  listPublicActiveCampaigns(storeId: string): Promise<CampaignRecord[]>;
  findCampaignById(storeId: string, campaignId: string): Promise<CampaignDetailRecord | null>;
  createCampaign(
    storeId: string,
    input: CampaignCreateRequest,
  ): Promise<CampaignRecord | CampaignMutationError>;
  updateCampaign(
    storeId: string,
    campaignId: string,
    input: CampaignUpdateRequest,
  ): Promise<CampaignRecord | null | CampaignMutationError>;
  setCampaignStatus(
    storeId: string,
    campaignId: string,
    status: Exclude<CampaignStatus, "DRAFT">,
  ): Promise<CampaignRecord | null | CampaignMutationError>;
  /**
   * Public sepet/checkout icin indirim baglami: ACTIVE otomatik kampanyalar +
   * (girildiyse) normalize kupon kodu eslesmesi + kimligi bilinen musterinin
   * kullanim sayilari. Kupon lookup'i STORE-SCOPED'tur (cross-store kupon
   * kullanilamaz).
   */
  loadCampaignDiscountContext(
    storeId: string,
    input: { normalizedCouponCode: string | null; customerId: string | null; email: string | null },
  ): Promise<DiscountContext>;
}

/** Izin verilen durum gecisleri (ARCHIVED terminaldir). */
const STATUS_TRANSITIONS: Record<CampaignStatus, ReadonlySet<CampaignStatus>> = {
  DRAFT: new Set(["ACTIVE", "ARCHIVED"]),
  ACTIVE: new Set(["PAUSED", "ARCHIVED"]),
  PAUSED: new Set(["ACTIVE", "ARCHIVED"]),
  ARCHIVED: new Set(),
};

export function isAllowedStatusTransition(from: CampaignStatus, to: CampaignStatus): boolean {
  return STATUS_TRANSITIONS[from].has(to);
}

export const campaignInclude = {
  products: { select: { productId: true } },
  categories: { select: { categoryId: true } },
  coupons: { orderBy: { createdAt: "asc" as const } },
} satisfies Prisma.CampaignInclude;

type CampaignRow = Prisma.CampaignGetPayload<{ include: typeof campaignInclude }>;

export function toCampaignRecord(row: CampaignRow): CampaignRecord {
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    description: row.description,
    status: row.status,
    type: row.type,
    discountType: row.discountType,
    discountValue: row.discountValue,
    maxDiscountAmountMinor: row.maxDiscountAmountMinor,
    minOrderAmountMinor: row.minOrderAmountMinor,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    totalUsageLimit: row.totalUsageLimit,
    perCustomerUsageLimit: row.perCustomerUsageLimit,
    usageCount: row.usageCount,
    stackable: row.stackable,
    priority: row.priority,
    isPublic: row.isPublic,
    displayTitle: row.displayTitle,
    shortDescription: row.shortDescription,
    terms: row.terms,
    badgeLabel: row.badgeLabel,
    badgeVariant: row.badgeVariant,
    cardStyle: row.cardStyle,
    accessModel: row.accessModel,
    displayPriority: row.displayPriority,
    productIds: row.products.map((item) => item.productId),
    categoryIds: row.categories.map((item) => item.categoryId),
    coupons: row.coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      normalizedCode: coupon.normalizedCode,
      status: coupon.status,
      totalUsageLimit: coupon.totalUsageLimit,
      perCustomerUsageLimit: coupon.perCustomerUsageLimit,
      usageCount: coupon.usageCount,
      startsAt: coupon.startsAt,
      endsAt: coupon.endsAt,
      createdAt: coupon.createdAt,
      updatedAt: coupon.updatedAt,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toEngineCampaign(record: CampaignRecord): EngineCampaign {
  return {
    id: record.id,
    name: record.name,
    status: record.status,
    type: record.type,
    discountType: record.discountType,
    discountValue: record.discountValue,
    maxDiscountAmountMinor: record.maxDiscountAmountMinor,
    minOrderAmountMinor: record.minOrderAmountMinor,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    totalUsageLimit: record.totalUsageLimit,
    perCustomerUsageLimit: record.perCustomerUsageLimit,
    usageCount: record.usageCount,
    stackable: record.stackable,
    priority: record.priority,
    productIds: record.productIds,
    categoryIds: record.categoryIds,
  };
}

export function toEngineCoupon(record: CampaignCouponRecord, campaignId: string): EngineCoupon {
  return {
    id: record.id,
    campaignId,
    code: record.code,
    normalizedCode: record.normalizedCode,
    status: record.status,
    totalUsageLimit: record.totalUsageLimit,
    perCustomerUsageLimit: record.perCustomerUsageLimit,
    usageCount: record.usageCount,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
  };
}

function isoOrNull(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** Kampanya kaydini admin API sozlesme sekline cevirir (ISO string tarihler). */
export function serializeCampaign(record: CampaignRecord): CampaignResponse {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    status: record.status,
    type: record.type,
    discountType: record.discountType,
    discountValue: record.discountValue,
    maxDiscountAmountMinor: record.maxDiscountAmountMinor,
    minOrderAmountMinor: record.minOrderAmountMinor,
    startsAt: isoOrNull(record.startsAt),
    endsAt: isoOrNull(record.endsAt),
    totalUsageLimit: record.totalUsageLimit,
    perCustomerUsageLimit: record.perCustomerUsageLimit,
    usageCount: record.usageCount,
    stackable: record.stackable,
    priority: record.priority,
    isPublic: record.isPublic,
    displayTitle: record.displayTitle,
    shortDescription: record.shortDescription,
    terms: record.terms,
    badgeLabel: record.badgeLabel,
    badgeVariant: record.badgeVariant,
    cardStyle: record.cardStyle,
    accessModel: record.accessModel,
    displayPriority: record.displayPriority,
    productIds: record.productIds,
    categoryIds: record.categoryIds,
    coupons: record.coupons.map((coupon) => ({
      id: coupon.id,
      code: coupon.code,
      normalizedCode: coupon.normalizedCode,
      status: coupon.status,
      totalUsageLimit: coupon.totalUsageLimit,
      perCustomerUsageLimit: coupon.perCustomerUsageLimit,
      usageCount: coupon.usageCount,
      startsAt: isoOrNull(coupon.startsAt),
      endsAt: isoOrNull(coupon.endsAt),
      createdAt: coupon.createdAt.toISOString(),
      updatedAt: coupon.updatedAt.toISOString(),
    })),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** E-posta maskesi: ab***@d***.com — admin detayda PII tam dokumu yapilmaz. */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return "***";
  const safeLocal = local.length <= 2 ? `${local[0] ?? "*"}***` : `${local.slice(0, 2)}***`;
  const domainParts = domain.split(".");
  const tld = domainParts.length > 1 ? domainParts[domainParts.length - 1] : "";
  const domainHead = domainParts[0] ?? "";
  return `${safeLocal}@${domainHead.slice(0, 1)}***${tld ? `.${tld}` : ""}`;
}

/** Kapsam id'lerinin bu store'a ait oldugunu dogrular. */
async function validateScopeOwnership(
  client: TransactionClient,
  storeId: string,
  productIds: string[],
  categoryIds: string[],
): Promise<CampaignMutationError | null> {
  if (productIds.length > 0) {
    const count = await client.product.count({ where: { storeId, id: { in: productIds } } });
    if (count !== new Set(productIds).size) return "SCOPE_PRODUCT_NOT_FOUND";
  }
  if (categoryIds.length > 0) {
    const count = await client.productCategory.count({ where: { storeId, id: { in: categoryIds } } });
    if (count !== new Set(categoryIds).size) return "SCOPE_CATEGORY_NOT_FOUND";
  }
  return null;
}

export function createPrismaCampaignDataAccess(): CampaignDataAccess {
  return {
    listCampaigns: async (storeId) => {
      const rows = await prisma.campaign.findMany({
        where: { storeId },
        orderBy: [{ createdAt: "desc" }],
        include: campaignInclude,
      });
      return rows.map(toCampaignRecord);
    },
    listPublicActiveCampaigns: async (storeId) => {
      const rows = await prisma.campaign.findMany({
        where: {
          storeId,
          status: "ACTIVE",
          isPublic: true,
          type: { in: ["COUPON_CODE", "AUTOMATIC_CART", "PRODUCT_DISCOUNT", "CATEGORY_DISCOUNT"] },
        },
        include: campaignInclude,
      });
      return rows.map(toCampaignRecord);
    },
    findCampaignById: async (storeId, campaignId) => {
      const row = await prisma.campaign.findFirst({
        where: { id: campaignId, storeId },
        include: campaignInclude,
      });
      if (!row) return null;
      // F4A.2 (ADR-059) — Analitik, kullanim (redemption) kayitlari + siparis
      // snapshot alanlarindan hesaplanir. (campaignId, orderId) unique oldugundan
      // her kayit ayri bir siparistir (cift sayim olmaz). MVP: kayitlar bellekte
      // toplanir; cok yuksek hacimde SQL aggregate'e tasinmasi TODO'dur.
      const [recent, aggregate, allRedemptions] = await Promise.all([
        prisma.campaignRedemption.findMany({
          where: { storeId, campaignId },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            orderId: true,
            email: true,
            discountAmountMinor: true,
            createdAt: true,
            order: { select: { orderNumber: true, totalAmount: true } },
            coupon: { select: { code: true } },
          },
        }),
        prisma.campaignRedemption.aggregate({
          where: { storeId, campaignId },
          _count: { _all: true },
          _sum: { discountAmountMinor: true },
        }),
        prisma.campaignRedemption.findMany({
          where: { storeId, campaignId },
          select: {
            customerId: true,
            email: true,
            createdAt: true,
            order: { select: { subtotalAmount: true, totalAmount: true } },
          },
        }),
      ]);

      const redemptionCount = aggregate._count._all;
      const totalDiscountMinor = aggregate._sum.discountAmountMinor ?? 0;
      const identities = new Set<string>();
      let ordersSubtotalMinor = 0;
      let ordersTotalMinor = 0;
      let lastRedemptionAt: Date | null = null;
      for (const redemption of allRedemptions) {
        const identity = redemption.customerId ?? redemption.email;
        if (identity) identities.add(identity);
        ordersSubtotalMinor += redemption.order?.subtotalAmount ?? 0;
        ordersTotalMinor += redemption.order?.totalAmount ?? 0;
        if (!lastRedemptionAt || redemption.createdAt > lastRedemptionAt) {
          lastRedemptionAt = redemption.createdAt;
        }
      }

      return {
        ...toCampaignRecord(row),
        recentRedemptions: recent.map((item) => ({
          id: item.id,
          orderId: item.orderId,
          orderNumber: item.order?.orderNumber ?? null,
          couponCode: item.coupon?.code ?? null,
          email: item.email,
          discountAmountMinor: item.discountAmountMinor,
          orderTotalMinor: item.order?.totalAmount ?? null,
          createdAt: item.createdAt,
        })),
        totalRedemptionCount: redemptionCount,
        totalDiscountMinor,
        analytics: {
          redemptionCount,
          uniqueCustomerCount: identities.size,
          totalDiscountMinor,
          ordersSubtotalMinor,
          ordersTotalMinor,
          avgDiscountPerOrderMinor:
            redemptionCount > 0 ? Math.round(totalDiscountMinor / redemptionCount) : 0,
          avgOrderTotalMinor:
            redemptionCount > 0 ? Math.round(ordersTotalMinor / redemptionCount) : 0,
          lastRedemptionAt,
        },
      };
    },
    createCampaign: (storeId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const scopeError = await validateScopeOwnership(
          transaction,
          storeId,
          input.productIds,
          input.categoryIds,
        );
        if (scopeError) return scopeError;

        const normalizedCode = normalizeCouponCode(input.couponCode ?? null);
        if (input.type === "COUPON_CODE" && normalizedCode) {
          const existing = await transaction.coupon.findUnique({
            where: { storeId_normalizedCode: { storeId, normalizedCode } },
            select: { id: true },
          });
          if (existing) return "DUPLICATE_COUPON_CODE";
        }

        const row = await transaction.campaign.create({
          data: {
            storeId,
            name: input.name,
            description: input.description ?? null,
            type: input.type,
            discountType: input.discountType,
            discountValue: input.discountValue,
            maxDiscountAmountMinor: input.maxDiscountAmountMinor ?? null,
            minOrderAmountMinor: input.minOrderAmountMinor ?? null,
            startsAt: input.startsAt ? new Date(input.startsAt) : null,
            endsAt: input.endsAt ? new Date(input.endsAt) : null,
            totalUsageLimit: input.totalUsageLimit ?? null,
            perCustomerUsageLimit: input.perCustomerUsageLimit ?? null,
            stackable: input.stackable,
            priority: input.priority,
            // F4A.4 — isPublic accessModel'den TURETILIR (authoritative gate).
            isPublic: deriveIsPublicFromAccessModel(input.accessModel),
            displayTitle: input.displayTitle ?? null,
            shortDescription: input.shortDescription ?? null,
            terms: input.terms ?? null,
            badgeLabel: input.badgeLabel ?? null,
            badgeVariant: input.badgeVariant ?? null,
            cardStyle: input.cardStyle,
            accessModel: input.accessModel,
            displayPriority: input.displayPriority,
            products: {
              create: [...new Set(input.productIds)].map((productId) => ({ productId, storeId })),
            },
            categories: {
              create: [...new Set(input.categoryIds)].map((categoryId) => ({ categoryId, storeId })),
            },
            ...(input.type === "COUPON_CODE" && normalizedCode
              ? {
                  coupons: {
                    create: {
                      storeId,
                      code: input.couponCode!.trim(),
                      normalizedCode,
                    },
                  },
                }
              : {}),
          },
          include: campaignInclude,
        });
        return toCampaignRecord(row);
      }),
    updateCampaign: (storeId, campaignId, input) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const existing = await transaction.campaign.findFirst({
          where: { id: campaignId, storeId },
          select: { id: true, status: true },
        });
        if (!existing) return null;
        // Arsivlenen kampanya duzenlenemez (yalniz goruntulenir).
        if (existing.status === "ARCHIVED") return "ARCHIVED_IMMUTABLE";

        const scopeError = await validateScopeOwnership(
          transaction,
          storeId,
          input.productIds ?? [],
          input.categoryIds ?? [],
        );
        if (scopeError) return scopeError;

        const data: Prisma.CampaignUpdateInput = {};
        if (input.name !== undefined) data.name = input.name;
        if (input.description !== undefined) data.description = input.description ?? null;
        if (input.discountType !== undefined) data.discountType = input.discountType;
        if (input.discountValue !== undefined) data.discountValue = input.discountValue;
        if (input.maxDiscountAmountMinor !== undefined) data.maxDiscountAmountMinor = input.maxDiscountAmountMinor ?? null;
        if (input.minOrderAmountMinor !== undefined) data.minOrderAmountMinor = input.minOrderAmountMinor ?? null;
        if (input.startsAt !== undefined) data.startsAt = input.startsAt ? new Date(input.startsAt) : null;
        if (input.endsAt !== undefined) data.endsAt = input.endsAt ? new Date(input.endsAt) : null;
        if (input.totalUsageLimit !== undefined) data.totalUsageLimit = input.totalUsageLimit ?? null;
        if (input.perCustomerUsageLimit !== undefined) data.perCustomerUsageLimit = input.perCustomerUsageLimit ?? null;
        if (input.stackable !== undefined) data.stackable = input.stackable;
        if (input.priority !== undefined) data.priority = input.priority;
        // F4A.4 — accessModel degisirse isPublic tutarli sekilde TURETILIR.
        if (input.accessModel !== undefined) {
          data.accessModel = input.accessModel;
          data.isPublic = deriveIsPublicFromAccessModel(input.accessModel);
        }
        if (input.displayTitle !== undefined) data.displayTitle = input.displayTitle ?? null;
        if (input.shortDescription !== undefined)
          data.shortDescription = input.shortDescription ?? null;
        if (input.terms !== undefined) data.terms = input.terms ?? null;
        if (input.badgeLabel !== undefined) data.badgeLabel = input.badgeLabel ?? null;
        if (input.badgeVariant !== undefined) data.badgeVariant = input.badgeVariant ?? null;
        if (input.cardStyle !== undefined) data.cardStyle = input.cardStyle;
        if (input.displayPriority !== undefined) data.displayPriority = input.displayPriority;

        await transaction.campaign.update({ where: { id: campaignId }, data });

        if (input.productIds !== undefined) {
          await transaction.campaignProduct.deleteMany({ where: { campaignId } });
          if (input.productIds.length > 0) {
            await transaction.campaignProduct.createMany({
              data: [...new Set(input.productIds)].map((productId) => ({ campaignId, productId, storeId })),
            });
          }
        }
        if (input.categoryIds !== undefined) {
          await transaction.campaignCategory.deleteMany({ where: { campaignId } });
          if (input.categoryIds.length > 0) {
            await transaction.campaignCategory.createMany({
              data: [...new Set(input.categoryIds)].map((categoryId) => ({ campaignId, categoryId, storeId })),
            });
          }
        }

        const row = await transaction.campaign.findFirst({
          where: { id: campaignId, storeId },
          include: campaignInclude,
        });
        return row ? toCampaignRecord(row) : null;
      }),
    setCampaignStatus: (storeId, campaignId, status) =>
      prisma.$transaction(async (transaction: TransactionClient) => {
        const existing = await transaction.campaign.findFirst({
          where: { id: campaignId, storeId },
          select: { id: true, status: true },
        });
        if (!existing) return null;
        if (!isAllowedStatusTransition(existing.status, status)) return "INVALID_STATUS_TRANSITION";
        const row = await transaction.campaign.update({
          where: { id: campaignId },
          data: { status },
          include: campaignInclude,
        });
        return toCampaignRecord(row);
      }),
    loadCampaignDiscountContext: async (storeId, input) => {
      const automaticRows = await prisma.campaign.findMany({
        where: {
          storeId,
          status: "ACTIVE",
          type: { in: ["AUTOMATIC_CART", "PRODUCT_DISCOUNT", "CATEGORY_DISCOUNT"] },
        },
        include: campaignInclude,
      });
      const automaticCampaigns = automaticRows.map((row) => toEngineCampaign(toCampaignRecord(row)));

      let coupon: EngineCoupon | null = null;
      let couponCampaign: EngineCampaign | null = null;
      if (input.normalizedCouponCode) {
        const couponRow = await prisma.coupon.findUnique({
          where: {
            storeId_normalizedCode: { storeId, normalizedCode: input.normalizedCouponCode },
          },
          include: { campaign: { include: campaignInclude } },
        });
        // Store scope'u unique key'de zaten var; defansif kontrol yine yapilir.
        if (couponRow && couponRow.storeId === storeId && couponRow.campaign.storeId === storeId) {
          const campaignRecord = toCampaignRecord(couponRow.campaign);
          couponCampaign = toEngineCampaign(campaignRecord);
          coupon = {
            id: couponRow.id,
            campaignId: couponRow.campaignId,
            code: couponRow.code,
            normalizedCode: couponRow.normalizedCode,
            status: couponRow.status,
            totalUsageLimit: couponRow.totalUsageLimit,
            perCustomerUsageLimit: couponRow.perCustomerUsageLimit,
            usageCount: couponRow.usageCount,
            startsAt: couponRow.startsAt,
            endsAt: couponRow.endsAt,
          };
        }
      }

      const customerUsageByCampaign = new Map<string, number>();
      const customerUsageByCoupon = new Map<string, number>();
      const identityFilters: Prisma.CampaignRedemptionWhereInput[] = [];
      if (input.customerId) identityFilters.push({ customerId: input.customerId });
      if (input.email) identityFilters.push({ email: input.email });
      const campaignIds = [
        ...automaticCampaigns.map((campaign) => campaign.id),
        ...(couponCampaign ? [couponCampaign.id] : []),
      ];
      if (identityFilters.length > 0 && campaignIds.length > 0) {
        const rows = await prisma.campaignRedemption.findMany({
          where: { storeId, campaignId: { in: campaignIds }, OR: identityFilters },
          select: { campaignId: true, couponId: true },
        });
        for (const row of rows) {
          customerUsageByCampaign.set(row.campaignId, (customerUsageByCampaign.get(row.campaignId) ?? 0) + 1);
          if (row.couponId) {
            customerUsageByCoupon.set(row.couponId, (customerUsageByCoupon.get(row.couponId) ?? 0) + 1);
          }
        }
      }

      return { automaticCampaigns, coupon, couponCampaign, customerUsageByCampaign, customerUsageByCoupon };
    },
  };
}

/**
 * Siparis olusturma transaction'inda indirim snapshot'i + redemption yazimi.
 * Kullanim limitleri BURADA yeniden ve ATOMIK dogrulanir (quote anindaki
 * degerlendirme yaris kosuluna acik oldugundan tek gecerli kontrol budur).
 * Hata donerse cagiran transaction'i iptal etmelidir (siparis olusmaz).
 */
export async function applyOrderDiscountsInTransaction(
  transaction: TransactionClient,
  storeId: string,
  orderId: string,
  input: {
    discounts: OrderDiscountInput[];
    customerId: string | null;
    email: string | null;
  },
): Promise<RedemptionError | null> {
  for (const discount of input.discounts) {
    if (discount.campaignId) {
      const campaign = await transaction.campaign.findFirst({
        where: { id: discount.campaignId, storeId },
        select: { id: true, status: true, totalUsageLimit: true, perCustomerUsageLimit: true },
      });
      if (!campaign || campaign.status !== "ACTIVE") return "CAMPAIGN_NOT_ACTIVE";

      // Toplam limit: kosullu increment atomiktir (etkilenen satir 0 => limit doldu).
      const campaignWhere: Prisma.CampaignWhereInput = {
        id: campaign.id,
        storeId,
        status: "ACTIVE",
        ...(campaign.totalUsageLimit !== null
          ? { usageCount: { lt: campaign.totalUsageLimit } }
          : {}),
      };
      const updated = await transaction.campaign.updateMany({
        where: campaignWhere,
        data: { usageCount: { increment: 1 } },
      });
      if (updated.count === 0) return "CAMPAIGN_USAGE_LIMIT";

      // Per-customer limit: kimlik (customerId/email) uzerinden ayni transaction'da sayilir.
      if (campaign.perCustomerUsageLimit !== null && (input.customerId || input.email)) {
        const identityFilters: Prisma.CampaignRedemptionWhereInput[] = [];
        if (input.customerId) identityFilters.push({ customerId: input.customerId });
        if (input.email) identityFilters.push({ email: input.email });
        const used = await transaction.campaignRedemption.count({
          where: { storeId, campaignId: campaign.id, OR: identityFilters },
        });
        if (used >= campaign.perCustomerUsageLimit) return "CAMPAIGN_USAGE_LIMIT";
      }

      if (discount.couponId) {
        const coupon = await transaction.coupon.findFirst({
          where: { id: discount.couponId, storeId, campaignId: campaign.id },
          select: { id: true, status: true, totalUsageLimit: true, perCustomerUsageLimit: true },
        });
        if (!coupon || coupon.status !== "ACTIVE") return "CAMPAIGN_NOT_ACTIVE";
        const couponWhere: Prisma.CouponWhereInput = {
          id: coupon.id,
          storeId,
          status: "ACTIVE",
          ...(coupon.totalUsageLimit !== null ? { usageCount: { lt: coupon.totalUsageLimit } } : {}),
        };
        const couponUpdated = await transaction.coupon.updateMany({
          where: couponWhere,
          data: { usageCount: { increment: 1 } },
        });
        if (couponUpdated.count === 0) return "COUPON_USAGE_LIMIT";

        if (coupon.perCustomerUsageLimit !== null && (input.customerId || input.email)) {
          const identityFilters: Prisma.CampaignRedemptionWhereInput[] = [];
          if (input.customerId) identityFilters.push({ customerId: input.customerId });
          if (input.email) identityFilters.push({ email: input.email });
          const used = await transaction.campaignRedemption.count({
            where: { storeId, couponId: coupon.id, OR: identityFilters },
          });
          if (used >= coupon.perCustomerUsageLimit) return "COUPON_USAGE_LIMIT";
        }
      }

      await transaction.campaignRedemption.create({
        data: {
          storeId,
          campaignId: campaign.id,
          couponId: discount.couponId,
          orderId,
          customerId: input.customerId,
          email: input.email,
          discountAmountMinor: discount.discountAmountMinor,
        },
      });

      // F4A.3 (ADR-060) — Kupon cuzdanini USED isaretle (AYNI transaction; siparis
      // rollback olursa USED yazilmaz). Kimlige (customerId/email) ait mevcut satir
      // guncellenir; yoksa (misafir cookie claim'i) tarihsel USED satiri yaratilir.
      // Wallet YAZIMI indirim tutarini ETKILEMEZ — yalniz cuzdan durumudur.
      if (discount.couponId && (input.customerId || input.email)) {
        const identityFilters: Prisma.CustomerCouponWhereInput[] = [];
        if (input.customerId) identityFilters.push({ customerId: input.customerId });
        if (input.email) identityFilters.push({ email: input.email });
        const marked = await transaction.customerCoupon.updateMany({
          where: {
            storeId,
            couponId: discount.couponId,
            status: { in: ["AVAILABLE", "APPLIED"] },
            OR: identityFilters,
          },
          data: { status: "USED", usedAt: new Date(), orderId },
        });
        if (marked.count === 0) {
          // Cuzdanda satir yok (misafir/kod-claim): tarihsel USED satiri (dedup upsert).
          const key = input.customerId
            ? { storeId_couponId_customerId: { storeId, couponId: discount.couponId, customerId: input.customerId } }
            : { storeId_couponId_email: { storeId, couponId: discount.couponId, email: input.email! } };
          await transaction.customerCoupon.upsert({
            where: key,
            create: {
              storeId,
              couponId: discount.couponId,
              campaignId: campaign.id,
              customerId: input.customerId,
              email: input.email,
              source: "CODE_CLAIMED",
              status: "USED",
              usedAt: new Date(),
              orderId,
            },
            update: { status: "USED", usedAt: new Date(), orderId },
          });
        }
      }
    }

    await transaction.orderDiscount.create({
      data: {
        storeId,
        orderId,
        campaignId: discount.campaignId,
        couponId: discount.couponId,
        code: discount.code,
        label: discount.label,
        discountType: discount.discountType,
        discountValue: discount.discountValue,
        discountAmountMinor: discount.discountAmountMinor,
        scopeSummary: (discount.scopeSummary ?? undefined) as Prisma.InputJsonObject | undefined,
      },
    });
  }
  return null;
}
