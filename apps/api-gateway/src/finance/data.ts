/**
 * Financial Reporting Foundation (ADR-268) — Prisma veri erişimi (DB-tarafı agregasyon).
 *
 * Tüm sorgular `storeId` ile scope'lanır (tenant izolasyonu; §13). KAYNAK DOĞRUSU sipariş
 * SNAPSHOT'larıdır — canlı Product/Variant fiyatı ASLA join'lenmez. Aggregasyon `$queryRaw`
 * ile DB'de yapılır (milyonlarca satır memory'e çekilmez; §14). İş-günü sınırı mağaza
 * timezone'unda `(col AT TIME ZONE 'UTC') AT TIME ZONE tz` ile bucketlanır. Her currency
 * AYRI — cross-currency SESSİZ TOPLANMAZ (FX yok; §5).
 *
 * Satış evreni: Order.status ∈ {PLACED,CONFIRMED,FULFILLED}, satış tarihi
 * COALESCE(placedAt, createdAt). İptaller AYRI sayılır (kendi createdAt günü). Kırılım/
 * ödeme/indirim raporları SEÇİLİ tek currency içindir (özet birincil currency'i taşır).
 *
 * Filtreler (§9) sipariş-seviyesinde uygulanır: ürün/kategori/marka/kampanya/ödeme-yöntemi
 * filtreleri "eşleşen satır/indirim/tahsilat İÇEREN sipariş" (EXISTS) semantiğiyle TÜM
 * eşleşen siparişi kapsar (sipariş-seviyesi subtotal/discount/shipping satır-atfedilemez).
 */
import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type { FinanceDailyRow } from "./metrics.js";

export type PrismaLike = typeof prisma;

/** Rapor filtreleri (URL'de korunur; §9). Tümü opsiyonel. */
export interface FinanceFilters {
  currency?: string;
  status?: string;
  paymentStatus?: string;
  productId?: string;
  variantId?: string;
  categoryId?: string;
  brandId?: string;
  campaignId?: string;
  paymentMethod?: string;
}

/** tz-aware UTC yarı-açık aralık [fromUtc, toUtcExclusive). */
export interface FinanceRangeArg {
  fromUtc: Date;
  toUtcExclusive: Date;
  timezone: string;
}

export interface ProductBreakdownRow {
  productId: string;
  title: string;
  sku: string;
  units: number;
  grossMinor: number;
  listGrossMinor: number;
  discountMinor: number;
  netMinor: number;
  costMinor: number;
  orderCount: number;
  coveredUnits: number;
}

export interface VariantBreakdownRow extends ProductBreakdownRow {
  variantId: string;
  variantTitle: string;
}

export interface DimensionBreakdownRow {
  key: string;
  label: string;
  units: number;
  grossMinor: number;
  orderCount: number;
}

export interface PaymentReportRow {
  provider: string;
  method: string;
  paidCount: number;
  failedCount: number;
  refundedCount: number;
  collectedMinor: number;
  currency: string;
}

export interface DiscountReportRow {
  campaignId: string | null;
  couponId: string | null;
  code: string | null;
  label: string;
  usageCount: number;
  discountMinor: number;
  ordersGrossMinor: number;
}

export interface OrderFinancialLineRow {
  orderNumber: string;
  saleDate: Date | null;
  currency: string;
  status: string;
  paymentStatus: string;
  grossSalesMinor: number;
  discountsMinor: number;
  shippingRevenueMinor: number;
  taxMinor: number | null;
  totalMinor: number;
  unitsSold: number;
}

export interface FinanceBreakdowns {
  byProduct: ProductBreakdownRow[];
  byVariant: VariantBreakdownRow[];
  byCategory: DimensionBreakdownRow[];
  byBrand: DimensionBreakdownRow[];
  byPaymentMethod: PaymentReportRow[];
  byCampaign: DiscountReportRow[];
}

export interface FinanceDataAccess {
  getDailyRows(storeId: string, range: FinanceRangeArg, filters: FinanceFilters): Promise<FinanceDailyRow[]>;
  getBreakdowns(
    storeId: string,
    range: FinanceRangeArg,
    currency: string,
    filters: FinanceFilters,
    limit: number,
  ): Promise<FinanceBreakdowns>;
  getPaymentReport(
    storeId: string,
    range: FinanceRangeArg,
    currency: string,
    filters: FinanceFilters,
  ): Promise<PaymentReportRow[]>;
  getDiscountReport(
    storeId: string,
    range: FinanceRangeArg,
    currency: string,
    filters: FinanceFilters,
  ): Promise<DiscountReportRow[]>;
  getOrderFinancialLines(
    storeId: string,
    range: FinanceRangeArg,
    currency: string,
    filters: FinanceFilters,
    limit: number,
  ): Promise<OrderFinancialLineRow[]>;
}

const SALES_STATUS_LITERAL = Prisma.sql`('PLACED','CONFIRMED','FULFILLED')`;

function num(value: bigint | number | null): number {
  if (value === null) return 0;
  return typeof value === "bigint" ? Number(value) : value;
}

/** Sipariş-seviyesi EXISTS/eşitlik filtre fragmanları (alias `o`). */
function orderFilterFragments(f: FinanceFilters): Prisma.Sql[] {
  const parts: Prisma.Sql[] = [];
  if (f.currency) parts.push(Prisma.sql`o."currency" = ${f.currency}`);
  if (f.paymentStatus) parts.push(Prisma.sql`o."paymentStatus"::text = ${f.paymentStatus}`);
  if (f.productId)
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "OrderLine" x WHERE x."orderId" = o."id" AND x."productId" = ${f.productId})`,
    );
  if (f.variantId)
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "OrderLine" x WHERE x."orderId" = o."id" AND x."variantId" = ${f.variantId})`,
    );
  if (f.brandId)
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "OrderLine" x JOIN "Product" p ON p."id" = x."productId"
        WHERE x."orderId" = o."id" AND p."brandId" = ${f.brandId})`,
    );
  if (f.categoryId)
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "OrderLine" x JOIN "Product" p ON p."id" = x."productId"
        WHERE x."orderId" = o."id" AND (p."primaryCategoryId" = ${f.categoryId}
          OR EXISTS (SELECT 1 FROM "ProductCategoryAssignment" a WHERE a."productId" = p."id" AND a."categoryId" = ${f.categoryId})))`,
    );
  if (f.campaignId)
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "OrderDiscount" d WHERE d."orderId" = o."id" AND d."campaignId" = ${f.campaignId})`,
    );
  if (f.paymentMethod)
    parts.push(
      Prisma.sql`EXISTS (SELECT 1 FROM "PaymentAttempt" pa WHERE pa."orderId" = o."id"
        AND pa."method"::text = ${f.paymentMethod} AND pa."status"::text IN ('PAID','AUTHORIZED'))`,
    );
  return parts;
}

/** Satış siparişleri için tam WHERE (storeId + status + tz-aralık + filtreler). */
function salesWhere(storeId: string, range: FinanceRangeArg, f: FinanceFilters): Prisma.Sql {
  const statusClause = f.status
    ? Prisma.sql`o."status"::text = ${f.status}`
    : Prisma.sql`o."status" IN ${SALES_STATUS_LITERAL}`;
  const parts: Prisma.Sql[] = [
    Prisma.sql`o."storeId" = ${storeId}`,
    statusClause,
    Prisma.sql`COALESCE(o."placedAt", o."createdAt") >= ${range.fromUtc}`,
    Prisma.sql`COALESCE(o."placedAt", o."createdAt") < ${range.toUtcExclusive}`,
    ...orderFilterFragments(f),
  ];
  return Prisma.join(parts, " AND ");
}

export function createFinanceData(db: PrismaLike = prisma): FinanceDataAccess {
  return {
    async getDailyRows(storeId, range, filters) {
      const where = salesWhere(storeId, range, filters);
      const tz = range.timezone;
      const dayExpr = Prisma.sql`to_char((COALESCE(o."placedAt", o."createdAt") AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;

      // Ana satış agregasyonu — per-order snapshot tamlığı bir CTE'de belirlenir.
      const salesRows = await db.$queryRaw<
        Array<{
          day: string;
          currency: string;
          gross: bigint;
          discount: bigint;
          shipping: bigint;
          total: bigint;
          tax: bigint;
          netexvat: bigint;
          cost: bigint;
          order_count: bigint;
          paid_count: bigint;
          refunded_count: bigint;
          units: bigint;
          tax_covered: bigint;
          cost_covered: bigint;
        }>
      >(Prisma.sql`
        WITH line_agg AS (
          SELECT ol."orderId" AS oid,
            SUM(ol."quantity")::bigint AS units,
            COUNT(*)::bigint AS line_count,
            COUNT(ol."lineVatAmountMinor")::bigint AS vat_lines,
            COUNT(ol."lineNetAmountMinor")::bigint AS net_lines,
            COUNT(ol."lineCostMinor")::bigint AS cost_lines,
            COALESCE(SUM(ol."lineVatAmountMinor"),0)::bigint AS vat,
            COALESCE(SUM(ol."lineNetAmountMinor"),0)::bigint AS net,
            COALESCE(SUM(ol."lineCostMinor"),0)::bigint AS cost
          FROM "OrderLine" ol
          WHERE ol."storeId" = ${storeId}
          GROUP BY ol."orderId"
        ),
        ord AS (
          SELECT ${dayExpr} AS day, o."currency" AS currency,
            o."subtotalAmount" AS gross, o."discountAmount" AS discount,
            o."shippingAmount" AS shipping, o."totalAmount" AS total,
            o."paymentStatus"::text AS payment_status,
            COALESCE(la.units,0) AS units, COALESCE(la.vat,0) AS vat,
            COALESCE(la.net,0) AS net, COALESCE(la.cost,0) AS cost,
            (la.line_count > 0 AND la.vat_lines = la.line_count AND la.net_lines = la.line_count) AS vat_complete,
            (la.line_count > 0 AND la.vat_lines = la.line_count AND la.net_lines = la.line_count
              AND la.cost_lines = la.line_count) AS cost_complete
          FROM "Order" o
          LEFT JOIN line_agg la ON la.oid = o."id"
          WHERE ${where}
        )
        SELECT day, currency,
          COALESCE(SUM(gross),0)::bigint AS gross,
          COALESCE(SUM(discount),0)::bigint AS discount,
          COALESCE(SUM(shipping),0)::bigint AS shipping,
          COALESCE(SUM(total),0)::bigint AS total,
          COALESCE(SUM(CASE WHEN vat_complete THEN vat ELSE 0 END),0)::bigint AS tax,
          COALESCE(SUM(CASE WHEN vat_complete THEN net ELSE 0 END),0)::bigint AS netexvat,
          COALESCE(SUM(CASE WHEN cost_complete THEN cost ELSE 0 END),0)::bigint AS cost,
          COUNT(*)::bigint AS order_count,
          COUNT(*) FILTER (WHERE payment_status IN ('PAID','AUTHORIZED'))::bigint AS paid_count,
          COUNT(*) FILTER (WHERE payment_status IN ('REFUNDED','PARTIALLY_REFUNDED'))::bigint AS refunded_count,
          COALESCE(SUM(units),0)::bigint AS units,
          COUNT(*) FILTER (WHERE vat_complete)::bigint AS tax_covered,
          COUNT(*) FILTER (WHERE cost_complete)::bigint AS cost_covered
        FROM ord GROUP BY day, currency
      `);

      // İptal siparişleri AYRI (createdAt günü; satış tutarlarına girmez).
      const cancelParts: Prisma.Sql[] = [
        Prisma.sql`o."storeId" = ${storeId}`,
        Prisma.sql`o."status" = 'CANCELLED'`,
        Prisma.sql`o."createdAt" >= ${range.fromUtc}`,
        Prisma.sql`o."createdAt" < ${range.toUtcExclusive}`,
        ...(filters.currency ? [Prisma.sql`o."currency" = ${filters.currency}`] : []),
      ];
      const cancelWhere = Prisma.join(cancelParts, " AND ");
      const cancelRows = await db.$queryRaw<Array<{ day: string; currency: string; cancelled: bigint }>>(Prisma.sql`
        SELECT to_char((o."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
          o."currency" AS currency, COUNT(*)::bigint AS cancelled
        FROM "Order" o WHERE ${cancelWhere} GROUP BY day, currency
      `);

      const map = new Map<string, FinanceDailyRow>();
      const keyOf = (day: string, currency: string) => `${day}|${currency}`;
      for (const r of salesRows) {
        map.set(keyOf(r.day, r.currency), {
          date: r.day,
          currency: r.currency,
          grossSalesMinor: num(r.gross),
          discountsMinor: num(r.discount),
          shippingRevenueMinor: num(r.shipping),
          totalMinor: num(r.total),
          taxMinor: num(r.tax),
          netExVatMinor: num(r.netexvat),
          costMinor: num(r.cost),
          orderCount: num(r.order_count),
          paidOrderCount: num(r.paid_count),
          refundedOrderCount: num(r.refunded_count),
          productRefundsMinor: 0,
          shippingRefundsMinor: 0,
          unitsSold: num(r.units),
          cancelledOrderCount: 0,
          taxCoveredOrderCount: num(r.tax_covered),
          costCoveredOrderCount: num(r.cost_covered),
        });
      }
      for (const r of cancelRows) {
        const key = keyOf(r.day, r.currency);
        const existing = map.get(key);
        if (existing) {
          existing.cancelledOrderCount = num(r.cancelled);
        } else {
          map.set(key, {
            date: r.day,
            currency: r.currency,
            grossSalesMinor: 0,
            discountsMinor: 0,
            shippingRevenueMinor: 0,
            totalMinor: 0,
            taxMinor: 0,
            netExVatMinor: 0,
            costMinor: 0,
            orderCount: 0,
            paidOrderCount: 0,
            refundedOrderCount: 0,
            productRefundsMinor: 0,
            shippingRefundsMinor: 0,
            unitsSold: 0,
            cancelledOrderCount: num(r.cancelled),
            taxCoveredOrderCount: 0,
            costCoveredOrderCount: 0,
          });
        }
      }

      // TODO-170 (ADR-272) — GERÇEKLEŞEN refund'lar (yalnız SUCCEEDED OrderRefund), refund tarihiyle
      // (completedAt, store tz) gün×currency bucketlenir. Order sales evrenine + order-level filtrelere bağlı
      // (product filter dışı order'ın refund'u sayılmaz). productRefund inclusive KDV içerir → TEK KEZ düşülür;
      // shippingRefund ayrı. Cancelled order (satış evreni dışı) zaten join'de elenir → çift-sayım yok.
      const refundStatusClause = filters.status
        ? Prisma.sql`o."status"::text = ${filters.status}`
        : Prisma.sql`o."status" IN ${SALES_STATUS_LITERAL}`;
      const refundParts: Prisma.Sql[] = [
        Prisma.sql`r."storeId" = ${storeId}`,
        Prisma.sql`r."status" = 'SUCCEEDED'`,
        Prisma.sql`r."completedAt" IS NOT NULL`,
        Prisma.sql`r."completedAt" >= ${range.fromUtc}`,
        Prisma.sql`r."completedAt" < ${range.toUtcExclusive}`,
        refundStatusClause,
        ...orderFilterFragments(filters),
        ...(filters.currency ? [Prisma.sql`r."currency" = ${filters.currency}`] : []),
      ];
      const refundWhere = Prisma.join(refundParts, " AND ");
      const refundRows = await db.$queryRaw<
        Array<{ day: string; currency: string; product_refund: bigint; shipping_refund: bigint }>
      >(Prisma.sql`
        SELECT to_char((r."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
          r."currency" AS currency,
          COALESCE(SUM(r."productRefundMinor"),0)::bigint AS product_refund,
          COALESCE(SUM(r."shippingRefundMinor"),0)::bigint AS shipping_refund
        FROM "OrderRefund" r
        JOIN "Order" o ON o."id" = r."orderId"
        WHERE ${refundWhere}
        GROUP BY day, r."currency"
      `);
      for (const r of refundRows) {
        const key = keyOf(r.day, r.currency);
        const existing = map.get(key);
        if (existing) {
          existing.productRefundsMinor = num(r.product_refund);
          existing.shippingRefundsMinor = num(r.shipping_refund);
        } else {
          map.set(key, {
            date: r.day,
            currency: r.currency,
            grossSalesMinor: 0,
            discountsMinor: 0,
            shippingRevenueMinor: 0,
            totalMinor: 0,
            taxMinor: 0,
            netExVatMinor: 0,
            costMinor: 0,
            orderCount: 0,
            paidOrderCount: 0,
            refundedOrderCount: 0,
            productRefundsMinor: num(r.product_refund),
            shippingRefundsMinor: num(r.shipping_refund),
            unitsSold: 0,
            cancelledOrderCount: 0,
            taxCoveredOrderCount: 0,
            costCoveredOrderCount: 0,
          });
        }
      }
      return [...map.values()];
    },

    async getBreakdowns(storeId, range, currency, filters, limit) {
      const scoped: FinanceFilters = { ...filters, currency };
      const where = salesWhere(storeId, range, scoped);
      const take = Math.max(1, Math.min(limit, 200));

      const [products, variants, categories, brands, payments, campaigns] = await Promise.all([
        db.$queryRaw<
          Array<{
            productId: string;
            title: string;
            sku: string;
            units: bigint;
            gross: bigint;
            listgross: bigint;
            net: bigint;
            cost: bigint;
            order_count: bigint;
            covered_units: bigint;
          }>
        >(Prisma.sql`
          SELECT ol."productId" AS "productId", MAX(ol."title") AS title, MAX(ol."sku") AS sku,
            COALESCE(SUM(ol."quantity"),0)::bigint AS units,
            COALESCE(SUM(ol."totalAmount"),0)::bigint AS gross,
            COALESCE(SUM(COALESCE(ol."unitListPriceMinor", ol."unitPriceAmount") * ol."quantity"),0)::bigint AS listgross,
            COALESCE(SUM(ol."lineNetAmountMinor"),0)::bigint AS net,
            COALESCE(SUM(ol."lineCostMinor"),0)::bigint AS cost,
            COUNT(DISTINCT ol."orderId")::bigint AS order_count,
            COALESCE(SUM(CASE WHEN ol."lineCostMinor" IS NOT NULL AND ol."lineNetAmountMinor" IS NOT NULL
              THEN ol."quantity" ELSE 0 END),0)::bigint AS covered_units
          FROM "OrderLine" ol JOIN "Order" o ON o."id" = ol."orderId"
          WHERE ${where} GROUP BY ol."productId" ORDER BY gross DESC LIMIT ${take}
        `),
        db.$queryRaw<
          Array<{
            variantId: string;
            productId: string;
            title: string;
            variantTitle: string;
            sku: string;
            units: bigint;
            gross: bigint;
            listgross: bigint;
            net: bigint;
            cost: bigint;
            order_count: bigint;
            covered_units: bigint;
          }>
        >(Prisma.sql`
          SELECT ol."variantId" AS "variantId", MAX(ol."productId") AS "productId",
            MAX(ol."title") AS title, MAX(ol."variantTitle") AS "variantTitle", MAX(ol."sku") AS sku,
            COALESCE(SUM(ol."quantity"),0)::bigint AS units,
            COALESCE(SUM(ol."totalAmount"),0)::bigint AS gross,
            COALESCE(SUM(COALESCE(ol."unitListPriceMinor", ol."unitPriceAmount") * ol."quantity"),0)::bigint AS listgross,
            COALESCE(SUM(ol."lineNetAmountMinor"),0)::bigint AS net,
            COALESCE(SUM(ol."lineCostMinor"),0)::bigint AS cost,
            COUNT(DISTINCT ol."orderId")::bigint AS order_count,
            COALESCE(SUM(CASE WHEN ol."lineCostMinor" IS NOT NULL AND ol."lineNetAmountMinor" IS NOT NULL
              THEN ol."quantity" ELSE 0 END),0)::bigint AS covered_units
          FROM "OrderLine" ol JOIN "Order" o ON o."id" = ol."orderId"
          WHERE ${where} GROUP BY ol."variantId" ORDER BY gross DESC LIMIT ${take}
        `),
        db.$queryRaw<Array<{ key: string; label: string; units: bigint; gross: bigint; order_count: bigint }>>(Prisma.sql`
          SELECT COALESCE(c."id",'__none__') AS key, COALESCE(c."name",'Kategorisiz') AS label,
            COALESCE(SUM(ol."quantity"),0)::bigint AS units,
            COALESCE(SUM(ol."totalAmount"),0)::bigint AS gross,
            COUNT(DISTINCT ol."orderId")::bigint AS order_count
          FROM "OrderLine" ol JOIN "Order" o ON o."id" = ol."orderId"
          JOIN "Product" p ON p."id" = ol."productId"
          LEFT JOIN "ProductCategory" c ON c."id" = p."primaryCategoryId"
          WHERE ${where} GROUP BY c."id", c."name" ORDER BY gross DESC LIMIT ${take}
        `),
        db.$queryRaw<Array<{ key: string; label: string; units: bigint; gross: bigint; order_count: bigint }>>(Prisma.sql`
          SELECT COALESCE(b."id", p."brand", '__none__') AS key,
            COALESCE(b."name", p."brand", 'Markasız') AS label,
            COALESCE(SUM(ol."quantity"),0)::bigint AS units,
            COALESCE(SUM(ol."totalAmount"),0)::bigint AS gross,
            COUNT(DISTINCT ol."orderId")::bigint AS order_count
          FROM "OrderLine" ol JOIN "Order" o ON o."id" = ol."orderId"
          JOIN "Product" p ON p."id" = ol."productId"
          LEFT JOIN "Brand" b ON b."id" = p."brandId"
          WHERE ${where} GROUP BY COALESCE(b."id", p."brand", '__none__'), COALESCE(b."name", p."brand", 'Markasız')
          ORDER BY gross DESC LIMIT ${take}
        `),
        this.getPaymentReport(storeId, range, currency, filters),
        this.getDiscountReport(storeId, range, currency, filters),
      ]);

      return {
        byProduct: products.map((r) => {
          const gross = num(r.gross);
          const listgross = num(r.listgross);
          return {
            productId: r.productId,
            title: r.title ?? "",
            sku: r.sku ?? "",
            units: num(r.units),
            grossMinor: gross,
            listGrossMinor: listgross,
            discountMinor: Math.max(0, listgross - gross),
            netMinor: num(r.net),
            costMinor: num(r.cost),
            orderCount: num(r.order_count),
            coveredUnits: num(r.covered_units),
          };
        }),
        byVariant: variants.map((r) => {
          const gross = num(r.gross);
          const listgross = num(r.listgross);
          return {
            variantId: r.variantId,
            productId: r.productId,
            title: r.title ?? "",
            variantTitle: r.variantTitle ?? "",
            sku: r.sku ?? "",
            units: num(r.units),
            grossMinor: gross,
            listGrossMinor: listgross,
            discountMinor: Math.max(0, listgross - gross),
            netMinor: num(r.net),
            costMinor: num(r.cost),
            orderCount: num(r.order_count),
            coveredUnits: num(r.covered_units),
          };
        }),
        byCategory: categories.map((r) => ({
          key: r.key,
          label: r.label,
          units: num(r.units),
          grossMinor: num(r.gross),
          orderCount: num(r.order_count),
        })),
        byBrand: brands.map((r) => ({
          key: r.key,
          label: r.label,
          units: num(r.units),
          grossMinor: num(r.gross),
          orderCount: num(r.order_count),
        })),
        byPaymentMethod: payments,
        byCampaign: campaigns,
      };
    },

    async getPaymentReport(storeId, range, currency, filters) {
      // Tahsilat görünümü: PaymentAttempt, tahsilat tarihine göre bucketlanır
      // (COALESCE(paidAt, collectedAt, createdAt)). collectedMinor = PAID/AUTHORIZED toplamı.
      const parts: Prisma.Sql[] = [
        Prisma.sql`pa."storeId" = ${storeId}`,
        Prisma.sql`pa."currency" = ${currency}`,
        Prisma.sql`COALESCE(pa."paidAt", pa."collectedAt", pa."createdAt") >= ${range.fromUtc}`,
        Prisma.sql`COALESCE(pa."paidAt", pa."collectedAt", pa."createdAt") < ${range.toUtcExclusive}`,
      ];
      if (filters.paymentMethod) parts.push(Prisma.sql`pa."method"::text = ${filters.paymentMethod}`);
      const where = Prisma.join(parts, " AND ");
      const rows = await db.$queryRaw<
        Array<{
          provider: string | null;
          method: string;
          paid: bigint;
          failed: bigint;
          refunded: bigint;
          collected: bigint;
        }>
      >(Prisma.sql`
        SELECT COALESCE(pa."provider"::text, pa."manualMethod"::text, 'MANUAL') AS provider,
          pa."method"::text AS method,
          COUNT(*) FILTER (WHERE pa."status"::text IN ('PAID','AUTHORIZED'))::bigint AS paid,
          COUNT(*) FILTER (WHERE pa."status"::text = 'FAILED')::bigint AS failed,
          COUNT(*) FILTER (WHERE pa."status"::text = 'REFUNDED')::bigint AS refunded,
          COALESCE(SUM(pa."amount") FILTER (WHERE pa."status"::text IN ('PAID','AUTHORIZED')),0)::bigint AS collected
        FROM "PaymentAttempt" pa WHERE ${where}
        GROUP BY COALESCE(pa."provider"::text, pa."manualMethod"::text, 'MANUAL'), pa."method"
        ORDER BY collected DESC
      `);
      return rows.map((r) => ({
        provider: r.provider ?? "MANUAL",
        method: r.method,
        paidCount: num(r.paid),
        failedCount: num(r.failed),
        refundedCount: num(r.refunded),
        collectedMinor: num(r.collected),
        currency,
      }));
    },

    async getDiscountReport(storeId, range, currency, filters) {
      const scoped: FinanceFilters = { ...filters, currency };
      const where = salesWhere(storeId, range, scoped);
      const rows = await db.$queryRaw<
        Array<{
          campaignId: string | null;
          couponId: string | null;
          code: string | null;
          label: string;
          usage: bigint;
          discount: bigint;
          gross: bigint;
        }>
      >(Prisma.sql`
        SELECT d."campaignId" AS "campaignId", d."couponId" AS "couponId",
          MAX(d."code") AS code, MAX(d."label") AS label,
          COUNT(DISTINCT d."orderId")::bigint AS usage,
          COALESCE(SUM(d."discountAmountMinor"),0)::bigint AS discount,
          COALESCE(SUM(o."subtotalAmount"),0)::bigint AS gross
        FROM "OrderDiscount" d JOIN "Order" o ON o."id" = d."orderId"
        WHERE ${where} AND d."storeId" = ${storeId}
        GROUP BY d."campaignId", d."couponId" ORDER BY discount DESC LIMIT 100
      `);
      return rows.map((r) => ({
        campaignId: r.campaignId,
        couponId: r.couponId,
        code: r.code,
        label: r.label ?? "",
        usageCount: num(r.usage),
        discountMinor: num(r.discount),
        ordersGrossMinor: num(r.gross),
      }));
    },

    async getOrderFinancialLines(storeId, range, currency, filters, limit) {
      const scoped: FinanceFilters = { ...filters, currency };
      const where = salesWhere(storeId, range, scoped);
      const take = Math.max(1, Math.min(limit, 50000));
      const rows = await db.$queryRaw<
        Array<{
          orderNumber: string;
          saleDate: Date | null;
          currency: string;
          status: string;
          paymentStatus: string;
          gross: bigint;
          discount: bigint;
          shipping: bigint;
          tax: bigint | null;
          total: bigint;
          units: bigint;
        }>
      >(Prisma.sql`
        SELECT o."orderNumber" AS "orderNumber",
          COALESCE(o."placedAt", o."createdAt") AS "saleDate",
          o."currency" AS currency, o."status"::text AS status, o."paymentStatus"::text AS "paymentStatus",
          o."subtotalAmount"::bigint AS gross, o."discountAmount"::bigint AS discount,
          o."shippingAmount"::bigint AS shipping,
          (SELECT SUM(ol."lineVatAmountMinor") FROM "OrderLine" ol WHERE ol."orderId" = o."id")::bigint AS tax,
          o."totalAmount"::bigint AS total,
          COALESCE((SELECT SUM(ol."quantity") FROM "OrderLine" ol WHERE ol."orderId" = o."id"),0)::bigint AS units
        FROM "Order" o WHERE ${where}
        ORDER BY COALESCE(o."placedAt", o."createdAt") DESC LIMIT ${take}
      `);
      return rows.map((r) => ({
        orderNumber: r.orderNumber,
        saleDate: r.saleDate,
        currency: r.currency,
        status: r.status,
        paymentStatus: r.paymentStatus,
        grossSalesMinor: num(r.gross),
        discountsMinor: num(r.discount),
        shippingRevenueMinor: num(r.shipping),
        taxMinor: r.tax === null ? null : num(r.tax),
        totalMinor: num(r.total),
        unitsSold: num(r.units),
      }));
    },
  };
}
