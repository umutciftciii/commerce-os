/**
 * Shopping Balance Admin (Müşteri Bakiye Yönetimi) — SALT-OKUNUR projeksiyonlar.
 *
 * Store Admin "Finans > Alışveriş Bakiyesi" yüzeyi için per-müşteri agregasyon listesi,
 * mağaza-geneli KPI özeti ve müşteri detayı (lot + bucket + ledger). Finansal otorite
 * DEĞİŞMEZ: kullanılabilir bakiye = canlı lot Σ remaining
 * (`status=ACTIVE ∧ remaining>0 ∧ (expiresAt IS NULL ∨ expiresAt>now)`) — report.ts ile
 * bire bir aynı predikat (ADR-281/284). Lifetime bucket'lar append-only ledger'dan tip
 * bazında; amountMinor her zaman POZİTİF büyüklük, yön `direction`'da. Tüm para BigInt
 * minor; HTTP'ye string olarak taşınır. storeId-first scoped; raw SQL identifier'ları
 * çift-tırnaklı (modellerde @@map yok). N+1 YOK: liste tek sorgu (COUNT(*) OVER()).
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@commerce-os/db";
import type { CreditSourceType } from "@prisma/client";
import { getCustomerBalance, type CreditLedgerEntryView } from "./service.js";

export const EXPIRING_SOON_DEFAULT_DAYS = 30;

/** Goodwill kaynak sınıfı (canlı lot bakiyesi için). */
const GOODWILL_SOURCES: CreditSourceType[] = ["ADMIN_GOODWILL", "RECOVERY_GOODWILL"];
/** Refund-origin kaynak sınıfı (TODO-175 non-expiring lot'lar dahil). */
const REFUND_ORIGIN_SOURCES: CreditSourceType[] = ["ORDER_REFUND", "ORDER_CANCELLATION", "ORDER_RETURN"];

const dayMs = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Tipler
// ---------------------------------------------------------------------------

export interface ShoppingBalanceBuckets {
  availableMinor: bigint;
  issuedMinor: bigint;
  spentMinor: bigint;
  refundOriginMinor: bigint;
  restoredMinor: bigint;
  goodwillMinor: bigint;
  expiredMinor: bigint;
  nearestExpiryAt: Date | null;
  lastMovementAt: Date | null;
}

export interface ShoppingBalanceRow extends ShoppingBalanceBuckets {
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  currency: string;
}

export type ShoppingBalanceSort = "available" | "lastMovement" | "nearestExpiry" | "customer";

export interface ShoppingBalanceListParams {
  storeId: string;
  currency?: string;
  now?: Date;
  search?: string;
  balancePositiveOnly?: boolean;
  source?: "GOODWILL" | "REFUND_ORIGIN";
  expiringWithinDays?: number | null;
  sortBy?: ShoppingBalanceSort;
  sortOrder?: "asc" | "desc";
  limit: number;
  offset: number;
}

export interface ShoppingBalanceSummary {
  currency: string;
  outstandingLiabilityMinor: bigint;
  customersWithBalance: number;
  goodwillBalanceMinor: bigint;
  refundOriginBalanceMinor: bigint;
  expiringSoonMinor: bigint;
}

export interface CreditLotDetail {
  id: string;
  sourceType: CreditSourceType;
  sourceId: string | null;
  originalAmountMinor: bigint;
  remainingAmountMinor: bigint;
  status: string;
  issuedAt: Date;
  expiresAt: Date | null;
}

export interface CustomerBalanceDetail {
  customerId: string;
  customerName: string | null;
  customerEmail: string | null;
  currency: string;
  summary: ShoppingBalanceBuckets;
  lots: CreditLotDetail[];
  ledger: CreditLedgerEntryView[];
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

/**
 * Rapor/list para birimini çözer: verilmemişse mağazanın ilk lot'unun currency'si; hiç lot
 * yoksa "TRY". report.ts.resolveReportCurrency ile aynı semantik (store-credit tek-para).
 */
async function resolveCurrency(storeId: string, currencyInput?: string): Promise<string> {
  if (currencyInput) return currencyInput;
  const lot = await prisma.customerCreditLot.findFirst({
    where: { storeId },
    orderBy: { createdAt: "asc" },
    select: { currency: true },
  });
  return lot?.currency ?? "TRY";
}

const toBig = (v: unknown): bigint => {
  if (v === null || v === undefined) return 0n;
  if (typeof v === "bigint") return v;
  return BigInt(String(v));
};
const toDate = (v: unknown): Date | null => (v ? new Date(v as string) : null);

// ---------------------------------------------------------------------------
// 1) Per-müşteri liste (tek sorgu; N+1 yok)
// ---------------------------------------------------------------------------

interface RawListRow {
  customerId: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  available: string;
  issued: string;
  spent: string;
  refund_origin: string;
  restored: string;
  goodwill: string;
  expired: string;
  nearest_expiry: Date | null;
  last_movement: Date | null;
  total_count: bigint;
}

const fullName = (first: string | null, last: string | null): string | null => {
  const name = [first, last].filter(Boolean).join(" ").trim();
  return name.length ? name : null;
};

export async function listCustomerBalances(
  params: ShoppingBalanceListParams,
): Promise<{ rows: ShoppingBalanceRow[]; total: number; currency: string }> {
  const currency = await resolveCurrency(params.storeId, params.currency);
  const now = params.now ?? new Date();
  const expThreshold = new Date(
    now.getTime() + (params.expiringWithinDays ?? EXPIRING_SOON_DEFAULT_DAYS) * dayMs,
  );

  // WHERE ek koşulları (parametreli).
  const conds: Prisma.Sql[] = [];
  if (params.search && params.search.trim().length > 0) {
    const q = `%${params.search.trim().toLowerCase()}%`;
    conds.push(
      Prisma.sql`(lower(coalesce(c."firstName",'')) LIKE ${q} OR lower(coalesce(c."lastName",'')) LIKE ${q} OR lower(coalesce(c.email,'')) LIKE ${q})`,
    );
  }
  if (params.balancePositiveOnly) {
    conds.push(Prisma.sql`COALESCE(la.available,0) > 0`);
  }
  if (params.source === "GOODWILL") {
    conds.push(Prisma.sql`COALESCE(la.goodwill_balance,0) > 0`);
  } else if (params.source === "REFUND_ORIGIN") {
    conds.push(Prisma.sql`COALESCE(la.refund_balance,0) > 0`);
  }
  if (params.expiringWithinDays !== undefined && params.expiringWithinDays !== null) {
    conds.push(Prisma.sql`COALESCE(la.expiring_soon,0) > 0`);
  }
  const extraWhere = conds.length ? Prisma.sql`AND ${Prisma.join(conds, " AND ")}` : Prisma.empty;

  // ORDER BY (allowlist → Prisma.raw güvenli).
  const dir = params.sortOrder === "asc" ? "ASC" : "DESC";
  const orderCol: Record<ShoppingBalanceSort, string> = {
    available: `COALESCE(la.available,0) ${dir}`,
    lastMovement: `le.last_movement ${dir} NULLS LAST`,
    nearestExpiry: `la.nearest_expiry ${dir} NULLS LAST`,
    customer: `lower(coalesce(c."firstName",'')) ${dir}, lower(coalesce(c."lastName",'')) ${dir}, lower(coalesce(c.email,'')) ${dir}`,
  };
  const orderBy = Prisma.raw(orderCol[params.sortBy ?? "available"]);

  const rows = await prisma.$queryRaw<RawListRow[]>(Prisma.sql`
    WITH lot_agg AS (
      SELECT
        l."customerId",
        SUM(l."remainingAmountMinor") FILTER (WHERE l.live) AS available,
        SUM(l."remainingAmountMinor") FILTER (WHERE l.live AND l.goodwill) AS goodwill_balance,
        SUM(l."remainingAmountMinor") FILTER (WHERE l.live AND l.refund_origin) AS refund_balance,
        SUM(l."remainingAmountMinor") FILTER (WHERE l.live AND l.expires_soon) AS expiring_soon,
        MIN(l."expiresAt") FILTER (WHERE l.live AND l."expiresAt" IS NOT NULL) AS nearest_expiry
      FROM (
        SELECT
          "customerId", "remainingAmountMinor", "expiresAt",
          (status = 'ACTIVE' AND "remainingAmountMinor" > 0 AND ("expiresAt" IS NULL OR "expiresAt" > ${now})) AS live,
          ("sourceType"::text IN (${Prisma.join(GOODWILL_SOURCES)})) AS goodwill,
          ("sourceType"::text IN (${Prisma.join(REFUND_ORIGIN_SOURCES)})) AS refund_origin,
          ("expiresAt" IS NOT NULL AND "expiresAt" > ${now} AND "expiresAt" <= ${expThreshold}) AS expires_soon
        FROM "CustomerCreditLot"
        WHERE "storeId" = ${params.storeId} AND currency = ${currency}
      ) l
      GROUP BY l."customerId"
    ),
    ledger_agg AS (
      SELECT
        "customerId",
        SUM("amountMinor") FILTER (WHERE direction = 'CREDIT') AS issued,
        SUM("amountMinor") FILTER (WHERE type = 'ORDER_PAYMENT_DEBIT') AS spent,
        SUM("amountMinor") FILTER (WHERE type = 'REFUND_RESTORE') AS refund_origin,
        SUM("amountMinor") FILTER (WHERE type IN ('ORDER_CANCELLATION_RESTORE','RETURN_CREDIT_RESTORE')) AS restored,
        SUM("amountMinor") FILTER (WHERE type IN ('ADMIN_GOODWILL_CREDIT','RECOVERY_GOODWILL_CREDIT')) AS goodwill,
        SUM("amountMinor") FILTER (WHERE type = 'EXPIRE') AS expired,
        MAX("createdAt") AS last_movement
      FROM "CustomerCreditLedgerEntry"
      WHERE "storeId" = ${params.storeId} AND currency = ${currency}
      GROUP BY "customerId"
    )
    SELECT
      acc."customerId" AS "customerId",
      c."firstName" AS "firstName",
      c."lastName" AS "lastName",
      c.email AS email,
      COALESCE(la.available,0)::text AS available,
      COALESCE(le.issued,0)::text AS issued,
      COALESCE(le.spent,0)::text AS spent,
      COALESCE(le.refund_origin,0)::text AS refund_origin,
      COALESCE(le.restored,0)::text AS restored,
      COALESCE(le.goodwill,0)::text AS goodwill,
      COALESCE(le.expired,0)::text AS expired,
      la.nearest_expiry AS nearest_expiry,
      le.last_movement AS last_movement,
      COUNT(*) OVER() AS total_count
    FROM "CustomerCreditAccount" acc
    JOIN "Customer" c ON c.id = acc."customerId"
    LEFT JOIN lot_agg la ON la."customerId" = acc."customerId"
    LEFT JOIN ledger_agg le ON le."customerId" = acc."customerId"
    WHERE acc."storeId" = ${params.storeId} AND acc.currency = ${currency}
    ${extraWhere}
    ORDER BY ${orderBy}, acc."customerId" ASC
    LIMIT ${params.limit} OFFSET ${params.offset}
  `);

  const total = rows.length > 0 ? Number(rows[0]!.total_count) : 0;
  return {
    currency,
    total,
    rows: rows.map((r) => ({
      customerId: r.customerId,
      customerName: fullName(r.firstName, r.lastName),
      customerEmail: r.email,
      currency,
      availableMinor: toBig(r.available),
      issuedMinor: toBig(r.issued),
      spentMinor: toBig(r.spent),
      refundOriginMinor: toBig(r.refund_origin),
      restoredMinor: toBig(r.restored),
      goodwillMinor: toBig(r.goodwill),
      expiredMinor: toBig(r.expired),
      nearestExpiryAt: toDate(r.nearest_expiry),
      lastMovementAt: toDate(r.last_movement),
    })),
  };
}

// ---------------------------------------------------------------------------
// 2) Mağaza-geneli KPI özeti (filtreden bağımsız)
// ---------------------------------------------------------------------------

interface RawSummaryRow {
  outstanding: string;
  customers: bigint;
  goodwill: string;
  refund_origin: string;
  expiring_soon: string;
}

export async function shoppingBalanceSummary(params: {
  storeId: string;
  currency?: string;
  now?: Date;
  expiringWithinDays?: number;
}): Promise<ShoppingBalanceSummary> {
  const currency = await resolveCurrency(params.storeId, params.currency);
  const now = params.now ?? new Date();
  const expThreshold = new Date(
    now.getTime() + (params.expiringWithinDays ?? EXPIRING_SOON_DEFAULT_DAYS) * dayMs,
  );

  const rows = await prisma.$queryRaw<RawSummaryRow[]>(Prisma.sql`
    SELECT
      COALESCE(SUM("remainingAmountMinor"),0)::text AS outstanding,
      COUNT(DISTINCT "customerId") AS customers,
      COALESCE(SUM("remainingAmountMinor") FILTER (WHERE "sourceType"::text IN (${Prisma.join(GOODWILL_SOURCES)})),0)::text AS goodwill,
      COALESCE(SUM("remainingAmountMinor") FILTER (WHERE "sourceType"::text IN (${Prisma.join(REFUND_ORIGIN_SOURCES)})),0)::text AS refund_origin,
      COALESCE(SUM("remainingAmountMinor") FILTER (WHERE "expiresAt" IS NOT NULL AND "expiresAt" > ${now} AND "expiresAt" <= ${expThreshold}),0)::text AS expiring_soon
    FROM "CustomerCreditLot"
    WHERE "storeId" = ${params.storeId}
      AND currency = ${currency}
      AND status = 'ACTIVE'
      AND "remainingAmountMinor" > 0
      AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
  `);

  const r = rows[0];
  return {
    currency,
    outstandingLiabilityMinor: toBig(r?.outstanding),
    customersWithBalance: r ? Number(r.customers) : 0,
    goodwillBalanceMinor: toBig(r?.goodwill),
    refundOriginBalanceMinor: toBig(r?.refund_origin),
    expiringSoonMinor: toBig(r?.expiring_soon),
  };
}

// ---------------------------------------------------------------------------
// 3) Müşteri detayı (lot + bucket + ledger)
// ---------------------------------------------------------------------------

interface RawBucketRow {
  issued: string;
  spent: string;
  refund_origin: string;
  restored: string;
  goodwill: string;
  expired: string;
  last_movement: Date | null;
}

/** Per-müşteri lifetime bucket'lar (list ve detay ortak; DRY). */
async function customerBucketSums(
  storeId: string,
  customerId: string,
  currency: string,
): Promise<Omit<ShoppingBalanceBuckets, "availableMinor" | "nearestExpiryAt">> {
  const rows = await prisma.$queryRaw<RawBucketRow[]>(Prisma.sql`
    SELECT
      COALESCE(SUM("amountMinor") FILTER (WHERE direction = 'CREDIT'),0)::text AS issued,
      COALESCE(SUM("amountMinor") FILTER (WHERE type = 'ORDER_PAYMENT_DEBIT'),0)::text AS spent,
      COALESCE(SUM("amountMinor") FILTER (WHERE type = 'REFUND_RESTORE'),0)::text AS refund_origin,
      COALESCE(SUM("amountMinor") FILTER (WHERE type IN ('ORDER_CANCELLATION_RESTORE','RETURN_CREDIT_RESTORE')),0)::text AS restored,
      COALESCE(SUM("amountMinor") FILTER (WHERE type IN ('ADMIN_GOODWILL_CREDIT','RECOVERY_GOODWILL_CREDIT')),0)::text AS goodwill,
      COALESCE(SUM("amountMinor") FILTER (WHERE type = 'EXPIRE'),0)::text AS expired,
      MAX("createdAt") AS last_movement
    FROM "CustomerCreditLedgerEntry"
    WHERE "storeId" = ${storeId} AND "customerId" = ${customerId} AND currency = ${currency}
  `);
  const r = rows[0];
  return {
    issuedMinor: toBig(r?.issued),
    spentMinor: toBig(r?.spent),
    refundOriginMinor: toBig(r?.refund_origin),
    restoredMinor: toBig(r?.restored),
    goodwillMinor: toBig(r?.goodwill),
    expiredMinor: toBig(r?.expired),
    lastMovementAt: toDate(r?.last_movement ?? null),
  };
}

export async function getCustomerBalanceDetail(params: {
  storeId: string;
  customerId: string;
  currency?: string;
  now?: Date;
  ledgerLimit?: number;
}): Promise<CustomerBalanceDetail | null> {
  const account = await prisma.customerCreditAccount.findFirst({
    where: { storeId: params.storeId, customerId: params.customerId },
    select: { currency: true, customer: { select: { firstName: true, lastName: true, email: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!account) return null;
  const currency = params.currency ?? account.currency;

  const [balance, buckets, lotRows] = await Promise.all([
    getCustomerBalance(params.storeId, params.customerId, currency, params.ledgerLimit ?? 100),
    customerBucketSums(params.storeId, params.customerId, currency),
    prisma.customerCreditLot.findMany({
      where: { storeId: params.storeId, customerId: params.customerId, currency },
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }],
      select: {
        id: true,
        sourceType: true,
        sourceId: true,
        originalAmountMinor: true,
        remainingAmountMinor: true,
        status: true,
        createdAt: true,
        expiresAt: true,
      },
    }),
  ]);

  const nearestExpiryAt =
    lotRows
      .filter((l) => l.status === "ACTIVE" && l.remainingAmountMinor > 0n && l.expiresAt && l.expiresAt > (params.now ?? new Date()))
      .map((l) => l.expiresAt as Date)
      .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

  return {
    customerId: params.customerId,
    customerName: fullName(account.customer.firstName, account.customer.lastName),
    customerEmail: account.customer.email,
    currency,
    summary: {
      availableMinor: balance.availableMinor,
      nearestExpiryAt,
      ...buckets,
    },
    lots: lotRows.map((l) => ({
      id: l.id,
      sourceType: l.sourceType,
      sourceId: l.sourceId,
      originalAmountMinor: l.originalAmountMinor,
      remainingAmountMinor: l.remainingAmountMinor,
      status: l.status,
      issuedAt: l.createdAt,
      expiresAt: l.expiresAt,
    })),
    ledger: balance.entries,
  };
}
