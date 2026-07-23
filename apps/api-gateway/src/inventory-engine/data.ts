/**
 * TODO-152 (ADR-076) — Inventory Engine · VERİ ERİŞİMİ (DB-aware).
 *
 * Motor SAFtir (availability/calculator/validation/diff/fingerprint/preview); bu modül tüm IO'yu
 * yürütür. Preview salt-okumadır; apply TEK TRANSACTION içinde advisory-lock + stale-preview kontrolü
 * + yalnız-değişen yazım + append-only audit uygular. Okuma BATCH'lidir (N+1 YOK).
 *
 * InventoryItem KÖPRÜSÜ (ADR-076): DEFAULT depo için onHand/reserved'ın CANLI otoritesi InventoryItem'dır
 * (checkout/storefront/sipariş akışı orayı okur/yazar — sıfır regresyon). Bu katman default depo bakiyesini
 * okurken onHand/reserved'ı InventoryItem'dan OVERLAY eder (legacy adjust ile yazılsa bile stale okuma yok);
 * yazarken onHand değişimini InventoryItem.quantityOnHand'e aynı transaction'da SENKRON eder (compatibility
 * sync). `reserved` ASLA yazılmaz (sistem-kontrollü). Non-default depoda otorite tamamen InventoryBalance'tır.
 */

import { prisma } from "@commerce-os/db";
import { Prisma } from "@prisma/client";
import type {
  InventoryField,
  InventoryState,
  InventoryStockStatus,
  VariantStatus,
} from "./types.js";

type PrismaLike = Prisma.TransactionClient;

export interface InventoryProductRef {
  id: string;
}

export interface InventoryWarehouseRef {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  priority: number;
}

/** Stok yönetimine giren tek varyant (kanonik sırada) + görünür eksen etiketleri + güncel bakiye. */
export interface InventoryVariantRow {
  variantId: string;
  sku: string;
  title: string;
  status: VariantStatus;
  attributes: { code: string; label: string }[];
  current: InventoryState;
  /** Seçili depoda bu varyantın InventoryBalance kaydı var mı (false → sanal 0 satır). */
  balanceExists: boolean;
}

/** TODO-152A — Mağaza-geneli izleme satırı: varyant + ürün kimliği + seçili depo bakiyesi (SALT-OKUMA). */
export interface InventoryStoreVariantRow extends InventoryVariantRow {
  productId: string;
  productTitle: string;
  productSlug: string;
  /** TODO-159C — arama görünürlüğü (barkodla ara) + sıralama. */
  barcode: string | null;
  updatedAt: string;
}

/**
 * TODO-159C (ADR-092) — Mağaza-geneli matris SUNUCU-OTORİTER liste kriteri. `sortBy`
 * ALLOWLIST'tir (serbest metin ASLA orderBy'a geçmez); filtreler tenant-safe (storeId
 * her sorguda zorlanır) ve seçili depoda değerlendirilir.
 */
export interface InventoryStoreMatrixCriteria {
  search?: string;
  sortBy: "productTitle" | "sku" | "onHand" | "reserved" | "available" | "updatedAt";
  sortOrder: "asc" | "desc";
  limit: number;
  offset: number;
  stockStatus?: InventoryStockStatus;
  reserved?: "yes" | "no";
  variantStatus?: VariantStatus;
  productStatus?: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

/** Sayfadan BAĞIMSIZ özet (aktif filtreye uyan TÜM küme; ayrı aggregate sorgu). */
export interface InventoryStoreMatrixSummaryData {
  totalVariants: number;
  totalOnHand: number;
  totalReserved: number;
  totalSellable: number;
  totalIncoming: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  incoming: number;
  negative: number;
  noBalance: number;
}

/** Bir sayfa + toplam + özet (sunucu-otoriter). */
export interface InventoryStoreMatrixPage {
  rows: InventoryStoreVariantRow[];
  total: number;
  summary: InventoryStoreMatrixSummaryData;
}

/** Tek varyanta yazılacak hedef bakiye (yalnız değişen satırlar). reserved YAZILMAZ (mirror = current). */
export interface InventoryVariantWrite {
  variantId: string;
  target: InventoryState;
  changedFields: InventoryField[];
}

/** Audit satırı (append-only; batchId gruplu). */
export interface InventoryAuditRow {
  variantId: string;
  field: InventoryField;
  oldValue: number;
  newValue: number;
  delta: number;
}

export type InventoryAuditSource = "MANUAL_EDIT" | "BULK_OPERATION";

export interface InventoryTxContext {
  lockProductWarehouse(productId: string, warehouseId: string): Promise<void>;
  listVariants(
    storeId: string,
    productId: string,
    warehouse: InventoryWarehouseRef,
  ): Promise<InventoryVariantRow[]>;
  applyWrites(
    storeId: string,
    productId: string,
    warehouse: InventoryWarehouseRef,
    batchId: string,
    writes: InventoryVariantWrite[],
    audits: InventoryAuditRow[],
    source: InventoryAuditSource,
    reason: string | undefined,
    changedByPlatformUserId: string | null,
  ): Promise<void>;
}

export interface InventoryDataAccess {
  findProduct(storeId: string, productId: string): Promise<InventoryProductRef | null>;
  listWarehouses(storeId: string): Promise<InventoryWarehouseRef[]>;
  findWarehouse(storeId: string, warehouseId: string): Promise<InventoryWarehouseRef | null>;
  findDefaultWarehouse(storeId: string): Promise<InventoryWarehouseRef | null>;
  read<T>(fn: (ctx: Pick<InventoryTxContext, "listVariants">) => Promise<T>): Promise<T>;
  transaction<T>(fn: (ctx: InventoryTxContext) => Promise<T>): Promise<T>;
  /**
   * TODO-152A — Ürünlerin varyantlarını seçili depoda current bakiye ile okur (izleme merkezi).
   * TODO-159C (ADR-092) — SUNUCU-OTORİTER: kriterle filtreler/sıralar/sayfalar; bir sayfa + toplam
   * + sayfadan bağımsız özet döner (tek raw SQL tarama + aggregate; N+1 yok).
   */
  listStoreVariants(
    storeId: string,
    warehouse: InventoryWarehouseRef,
    criteria: InventoryStoreMatrixCriteria,
  ): Promise<InventoryStoreMatrixPage>;
}

// Kanonik sıra: combinationKey ASC (NULLS LAST → manuel sonda) → createdAt ASC → id ASC (commercial ile aynı).
const variantOrderBy: Prisma.ProductVariantOrderByWithRelationInput[] = [
  { combinationKey: "asc" },
  { createdAt: "asc" },
  { id: "asc" },
];

// Kapsam: non-archived (DRAFT+ACTIVE). ARCHIVED bulk apply'a girmez (varsayılan gizli).
const scopeWhere = (storeId: string, productId: string): Prisma.ProductVariantWhereInput => ({
  storeId,
  productId,
  status: { not: "ARCHIVED" },
});

function toWarehouseRef(w: {
  id: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  isDefault: boolean;
  priority: number;
}): InventoryWarehouseRef {
  return {
    id: w.id,
    code: w.code,
    name: w.name,
    status: w.status,
    isDefault: w.isDefault,
    priority: w.priority,
  };
}

// DEFAULT depo → onHand/reserved CANLI InventoryItem'dan overlay (tek otorite); yoksa balance; o da yoksa 0.
function buildCurrentState(
  balance: { onHand: number; reserved: number; incoming: number; safetyStock: number; reorderPoint: number } | undefined,
  item: { quantityOnHand: number; quantityReserved: number } | undefined,
): InventoryState {
  return {
    onHand: item ? item.quantityOnHand : (balance?.onHand ?? 0),
    reserved: item ? item.quantityReserved : (balance?.reserved ?? 0),
    incoming: balance?.incoming ?? 0,
    safetyStock: balance?.safetyStock ?? 0,
    reorderPoint: balance?.reorderPoint ?? 0,
  };
}

async function readVariants(
  tx: PrismaLike,
  storeId: string,
  productId: string,
  warehouse: InventoryWarehouseRef,
): Promise<InventoryVariantRow[]> {
  const variants = await tx.productVariant.findMany({
    where: scopeWhere(storeId, productId),
    orderBy: variantOrderBy,
    select: {
      id: true,
      sku: true,
      title: true,
      status: true,
      optionValueSelections: {
        select: {
          definition: { select: { code: true } },
          option: { select: { label: true } },
        },
      },
    },
  });
  const variantIds = variants.map((v) => v.id);

  // Batch: seçili depodaki balance'lar (N+1 YOK).
  const balances = await tx.inventoryBalance.findMany({
    where: { warehouseId: warehouse.id, variantId: { in: variantIds } },
    select: {
      variantId: true,
      onHand: true,
      reserved: true,
      incoming: true,
      safetyStock: true,
      reorderPoint: true,
    },
  });
  const balanceByVariant = new Map(balances.map((b) => [b.variantId, b]));

  // DEFAULT depo → onHand/reserved CANLI InventoryItem'dan overlay (tek otorite).
  const itemByVariant = new Map<string, { quantityOnHand: number; quantityReserved: number }>();
  if (warehouse.isDefault) {
    const items = await tx.inventoryItem.findMany({
      where: { storeId, variantId: { in: variantIds } },
      select: { variantId: true, quantityOnHand: true, quantityReserved: true },
    });
    for (const it of items) {
      itemByVariant.set(it.variantId, {
        quantityOnHand: it.quantityOnHand,
        quantityReserved: it.quantityReserved,
      });
    }
  }

  return variants.map((v) => {
    const balance = balanceByVariant.get(v.id);
    const item = itemByVariant.get(v.id);
    return {
      variantId: v.id,
      sku: v.sku,
      title: v.title,
      status: v.status as VariantStatus,
      attributes: v.optionValueSelections.map((ov) => ({
        code: ov.definition.code,
        label: ov.option.label,
      })),
      current: buildCurrentState(balance, item),
      balanceExists: balance !== undefined,
    };
  });
}

/** ILIKE '%…%' için wildcard kaçışı (\ % _). buildAdminProductScanSql ile AYNI otorite. */
const likePattern = (raw: string) => `%${raw.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * TODO-159C (ADR-092) — Mağaza-geneli matris TARAMA SQL'i (tek doğruluk kaynağı; sayfa + özet
 * bunu paylaşır). Çift otorite (ADR-076) SQL'de birebir korunur: DEFAULT depoda onHand/reserved
 * CANLI InventoryItem'dan overlay edilir (yoksa balance; o da yoksa 0), non-default'ta yalnız
 * balance. `stockStatus`/available türetmesi SAF calculator ile AYNI eşikleri kullanır (parite
 * testli). Tenant guard: v."storeId" = storeId HER zaman (savunma katmanı — depo zaten resolve edilmiş).
 *
 * `base` CTE resolved skaler kolonları; `calc` CTE türetilmiş rawAvailable/sellable/stockStatus'ü
 * üretir. `postWhere` (stockStatus/reserved) calc kolonlarına baktığı için calc'tan SONRA uygulanır.
 */
function buildStoreMatrixScan(
  storeId: string,
  warehouse: InventoryWarehouseRef,
  criteria: InventoryStoreMatrixCriteria,
): { cte: Prisma.Sql; postWhere: Prisma.Sql; orderBy: Prisma.Sql } {
  // DEFAULT depoda InventoryItem overlay (item satırı varsa onun değeri; yoksa balance; o da yoksa 0).
  const onHandExpr = warehouse.isDefault
    ? Prisma.sql`COALESCE(ii."quantityOnHand", ib."onHand", 0)`
    : Prisma.sql`COALESCE(ib."onHand", 0)`;
  const reservedExpr = warehouse.isDefault
    ? Prisma.sql`COALESCE(ii."quantityReserved", ib."reserved", 0)`
    : Prisma.sql`COALESCE(ib."reserved", 0)`;
  const itemJoin = warehouse.isDefault
    ? Prisma.sql`LEFT JOIN "InventoryItem" ii ON ii."variantId" = v."id" AND ii."storeId" = ${storeId}`
    : Prisma.empty;

  // base WHERE: tenant + kapsam (non-archived) + opsiyonel arama/varyant-durumu/ürün-durumu.
  const baseConditions: Prisma.Sql[] = [
    Prisma.sql`v."storeId" = ${storeId}`,
    Prisma.sql`v."status" <> 'ARCHIVED'`,
  ];
  if (criteria.search) {
    const pattern = likePattern(criteria.search);
    baseConditions.push(Prisma.sql`(
      p."title" ILIKE ${pattern} ESCAPE '\\'
      OR p."slug" ILIKE ${pattern} ESCAPE '\\'
      OR v."title" ILIKE ${pattern} ESCAPE '\\'
      OR v."sku" ILIKE ${pattern} ESCAPE '\\'
      OR v."barcode" ILIKE ${pattern} ESCAPE '\\'
    )`);
  }
  if (criteria.variantStatus) {
    baseConditions.push(Prisma.sql`v."status"::text = ${criteria.variantStatus}`);
  }
  if (criteria.productStatus) {
    baseConditions.push(Prisma.sql`p."status"::text = ${criteria.productStatus}`);
  }
  const baseWhere = Prisma.sql`WHERE ${Prisma.join(baseConditions, " AND ")}`;

  const cte = Prisma.sql`WITH base AS (
    SELECT
      v."id" AS "variantId",
      v."sku" AS "sku",
      v."barcode" AS "barcode",
      v."title" AS "title",
      v."status"::text AS "variantStatus",
      v."updatedAt" AS "updatedAt",
      v."productId" AS "productId",
      p."title" AS "productTitle",
      p."slug" AS "productSlug",
      (ib."variantId" IS NOT NULL) AS "balanceExists",
      ${onHandExpr} AS "onHand",
      ${reservedExpr} AS "reserved",
      COALESCE(ib."incoming", 0) AS "incoming",
      COALESCE(ib."safetyStock", 0) AS "safetyStock",
      COALESCE(ib."reorderPoint", 0) AS "reorderPoint"
    FROM "ProductVariant" v
    JOIN "Product" p ON p."id" = v."productId"
    LEFT JOIN "InventoryBalance" ib ON ib."variantId" = v."id" AND ib."warehouseId" = ${warehouse.id}
    ${itemJoin}
    ${baseWhere}
  ), calc AS (
    SELECT b.*,
      (b."onHand" - b."reserved" - b."safetyStock") AS "rawAvailable",
      GREATEST(b."onHand" - b."reserved" - b."safetyStock", 0) AS "sellable",
      CASE
        WHEN NOT b."balanceExists" THEN 'NO_BALANCE'
        WHEN (b."onHand" - b."reserved" - b."safetyStock") < 0 THEN 'NEGATIVE'
        WHEN GREATEST(b."onHand" - b."reserved" - b."safetyStock", 0) = 0 AND b."incoming" > 0 THEN 'INCOMING'
        WHEN GREATEST(b."onHand" - b."reserved" - b."safetyStock", 0) = 0 THEN 'OUT_OF_STOCK'
        WHEN b."reorderPoint" > 0 AND GREATEST(b."onHand" - b."reserved" - b."safetyStock", 0) <= b."reorderPoint" THEN 'LOW_STOCK'
        ELSE 'IN_STOCK'
      END AS "stockStatus"
    FROM base b
  )`;

  // postWhere: türetilmiş kolonlara (stockStatus/reserved) bakan filtreler.
  const postConditions: Prisma.Sql[] = [];
  if (criteria.stockStatus) {
    postConditions.push(Prisma.sql`"stockStatus" = ${criteria.stockStatus}`);
  }
  if (criteria.reserved === "yes") postConditions.push(Prisma.sql`"reserved" > 0`);
  if (criteria.reserved === "no") postConditions.push(Prisma.sql`"reserved" = 0`);
  const postWhere =
    postConditions.length > 0
      ? Prisma.sql`WHERE ${Prisma.join(postConditions, " AND ")}`
      : Prisma.empty;

  // ALLOWLIST → sabit SQL ifadesi. NULLS LAST + ikincil productId/variantId: aynı ürünün
  // varyantları bitişik kalır ve sayfa sınırı deterministiktir (kayıt atlanmaz/tekrarlanmaz).
  const direction = criteria.sortOrder === "asc" ? Prisma.sql`ASC` : Prisma.sql`DESC`;
  const sortExpression: Record<InventoryStoreMatrixCriteria["sortBy"], Prisma.Sql> = {
    productTitle: Prisma.sql`LOWER("productTitle")`,
    sku: Prisma.sql`LOWER("sku")`,
    onHand: Prisma.sql`"onHand"`,
    reserved: Prisma.sql`"reserved"`,
    available: Prisma.sql`"sellable"`,
    updatedAt: Prisma.sql`"updatedAt"`,
  };
  const orderBy = Prisma.sql`ORDER BY ${sortExpression[criteria.sortBy]} ${direction} NULLS LAST, "productId" ASC, "variantId" ASC`;

  return { cte, postWhere, orderBy };
}

interface StoreMatrixScanRow {
  variantId: string;
  sku: string;
  barcode: string | null;
  title: string;
  variantStatus: string;
  updatedAt: Date;
  productId: string;
  productTitle: string;
  productSlug: string;
  balanceExists: boolean;
  onHand: number;
  reserved: number;
  incoming: number;
  safetyStock: number;
  reorderPoint: number;
}

interface StoreMatrixSummaryRow {
  totalVariants: number;
  totalOnHand: bigint | number | null;
  totalReserved: bigint | number | null;
  totalSellable: bigint | number | null;
  totalIncoming: bigint | number | null;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  incoming: number;
  negative: number;
  noBalance: number;
}

// TODO-152A/159C — Mağaza-geneli SUNUCU-OTORİTER okuma. Motor product-scoped kalır; bu uç seçili
// depoda filtreli/sıralı BİR SAYFA + toplam + sayfadan bağımsız özeti döner. Sorgu sayısı sabit:
// (1) sayfa taraması, (2) özet aggregate (count dahil), (3) sayfa id'leri için attribute hidrasyonu.
// N+1 YOK; sınırsız tarama YOK (LIMIT/OFFSET). currentCalc SERVİSTE SAF computeCalc ile hesaplanır
// (tek formül otoritesi); buradaki SQL türetmesi yalnız filtre/sıralama/özet içindir (parite testli).
async function readStoreVariants(
  storeId: string,
  warehouse: InventoryWarehouseRef,
  criteria: InventoryStoreMatrixCriteria,
): Promise<InventoryStoreMatrixPage> {
  const { cte, postWhere, orderBy } = buildStoreMatrixScan(storeId, warehouse, criteria);

  const [pageRows, summaryRows] = await Promise.all([
    prisma.$queryRaw<StoreMatrixScanRow[]>(Prisma.sql`
      ${cte}
      SELECT "variantId", "sku", "barcode", "title", "variantStatus", "updatedAt",
             "productId", "productTitle", "productSlug", "balanceExists",
             "onHand", "reserved", "incoming", "safetyStock", "reorderPoint"
      FROM calc
      ${postWhere}
      ${orderBy}
      LIMIT ${criteria.limit} OFFSET ${criteria.offset}
    `),
    prisma.$queryRaw<StoreMatrixSummaryRow[]>(Prisma.sql`
      ${cte}
      SELECT
        COUNT(*)::int AS "totalVariants",
        COALESCE(SUM("onHand"), 0)::bigint AS "totalOnHand",
        COALESCE(SUM("reserved"), 0)::bigint AS "totalReserved",
        COALESCE(SUM("sellable"), 0)::bigint AS "totalSellable",
        COALESCE(SUM("incoming"), 0)::bigint AS "totalIncoming",
        COUNT(*) FILTER (WHERE "stockStatus" = 'IN_STOCK')::int AS "inStock",
        COUNT(*) FILTER (WHERE "stockStatus" = 'LOW_STOCK')::int AS "lowStock",
        COUNT(*) FILTER (WHERE "stockStatus" = 'OUT_OF_STOCK')::int AS "outOfStock",
        COUNT(*) FILTER (WHERE "stockStatus" = 'INCOMING')::int AS "incoming",
        COUNT(*) FILTER (WHERE "stockStatus" = 'NEGATIVE')::int AS "negative",
        COUNT(*) FILTER (WHERE "stockStatus" = 'NO_BALANCE')::int AS "noBalance"
      FROM calc
      ${postWhere}
    `),
  ]);

  // Attribute hidrasyonu: YALNIZ sayfadaki varyant id'leri için tek batched sorgu (N+1 yok).
  const pageIds = pageRows.map((r) => r.variantId);
  const attrByVariant = new Map<string, { code: string; label: string }[]>();
  if (pageIds.length > 0) {
    const withAttrs = await prisma.productVariant.findMany({
      where: { id: { in: pageIds }, storeId },
      select: {
        id: true,
        optionValueSelections: {
          select: {
            definition: { select: { code: true } },
            option: { select: { label: true } },
          },
        },
      },
    });
    for (const v of withAttrs) {
      attrByVariant.set(
        v.id,
        v.optionValueSelections.map((ov) => ({ code: ov.definition.code, label: ov.option.label })),
      );
    }
  }

  const rows: InventoryStoreVariantRow[] = pageRows.map((r) => ({
    variantId: r.variantId,
    sku: r.sku,
    barcode: r.barcode,
    title: r.title,
    status: r.variantStatus as VariantStatus,
    attributes: attrByVariant.get(r.variantId) ?? [],
    current: {
      onHand: r.onHand,
      reserved: r.reserved,
      incoming: r.incoming,
      safetyStock: r.safetyStock,
      reorderPoint: r.reorderPoint,
    },
    balanceExists: r.balanceExists,
    productId: r.productId,
    productTitle: r.productTitle,
    productSlug: r.productSlug,
    updatedAt: r.updatedAt.toISOString(),
  }));

  const s = summaryRows[0];
  const summary: InventoryStoreMatrixSummaryData = {
    totalVariants: s ? Number(s.totalVariants) : 0,
    totalOnHand: s ? Number(s.totalOnHand ?? 0) : 0,
    totalReserved: s ? Number(s.totalReserved ?? 0) : 0,
    totalSellable: s ? Number(s.totalSellable ?? 0) : 0,
    totalIncoming: s ? Number(s.totalIncoming ?? 0) : 0,
    inStock: s ? Number(s.inStock) : 0,
    lowStock: s ? Number(s.lowStock) : 0,
    outOfStock: s ? Number(s.outOfStock) : 0,
    incoming: s ? Number(s.incoming) : 0,
    negative: s ? Number(s.negative) : 0,
    noBalance: s ? Number(s.noBalance) : 0,
  };

  return { rows, total: summary.totalVariants, summary };
}

function makeTxContext(tx: PrismaLike): InventoryTxContext {
  return {
    lockProductWarehouse: async (productId, warehouseId) => {
      // 2C-3 dersi: pg_advisory_xact_lock `void` döner → $executeRaw ŞART ($queryRaw 500 verir).
      // Aynı product+warehouse apply'ları serileşir (deterministik anahtar).
      const key = `inv:${productId}:${warehouseId}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    },
    listVariants: (storeId, productId, warehouse) => readVariants(tx, storeId, productId, warehouse),
    applyWrites: async (storeId, productId, warehouse, batchId, writes, audits, source, reason, actorId) => {
      for (const w of writes) {
        // InventoryBalance upsert (varyant × depo tek satır). reserved = current mirror (target.reserved
        // = okunan canlı reserved; DEFAULT depoda InventoryItem'dan gelir, non-default'ta balance'tan).
        await tx.inventoryBalance.upsert({
          where: { warehouseId_variantId: { warehouseId: warehouse.id, variantId: w.variantId } },
          update: {
            onHand: w.target.onHand,
            reserved: w.target.reserved,
            incoming: w.target.incoming,
            safetyStock: w.target.safetyStock,
            reorderPoint: w.target.reorderPoint,
          },
          create: {
            storeId,
            warehouseId: warehouse.id,
            variantId: w.variantId,
            onHand: w.target.onHand,
            reserved: w.target.reserved,
            incoming: w.target.incoming,
            safetyStock: w.target.safetyStock,
            reorderPoint: w.target.reorderPoint,
          },
        });

        // DEFAULT depo + onHand değiştiyse InventoryItem.quantityOnHand'e SENKRON (compatibility sync).
        // checkout/storefront InventoryItem'ı okur → admin onHand düzenlemesi anında yansır. reserved'a
        // ASLA dokunulmaz (sipariş akışı sahibi). InventoryItem yoksa oluşturulur (quantityReserved korunur).
        const onHandAudit = audits.find((a) => a.variantId === w.variantId && a.field === "ON_HAND");
        if (warehouse.isDefault && onHandAudit) {
          await tx.inventoryItem.upsert({
            where: { variantId: w.variantId },
            update: { quantityOnHand: w.target.onHand },
            create: {
              storeId,
              variantId: w.variantId,
              quantityOnHand: w.target.onHand,
              quantityReserved: w.target.reserved,
            },
          });
          // Legacy hareket defteri ile tutarlılık: onHand delta'sını InventoryMovement'e de düş (ADJUSTMENT).
          await tx.inventoryMovement.create({
            data: {
              storeId,
              variantId: w.variantId,
              type: "ADJUSTMENT",
              quantityDelta: onHandAudit.delta,
              reason: reason ?? "Inventory Engine apply",
              referenceType: "InventoryAdjustment",
              referenceId: batchId,
              actorUserId: actorId,
            },
          });
        }
      }

      if (audits.length > 0) {
        await tx.inventoryAdjustment.createMany({
          data: audits.map((a) => ({
            storeId,
            warehouseId: warehouse.id,
            productId,
            variantId: a.variantId,
            field: a.field,
            oldValue: a.oldValue,
            newValue: a.newValue,
            delta: a.delta,
            reason: reason ?? null,
            source,
            batchId,
            changedByPlatformUserId: actorId,
          })),
        });
      }
    },
  };
}

export function createPrismaInventoryDataAccess(): InventoryDataAccess {
  return {
    findProduct: async (storeId, productId) => {
      const product = await prisma.product.findFirst({
        where: { id: productId, storeId },
        select: { id: true },
      });
      return product ? { id: product.id } : null;
    },
    listWarehouses: async (storeId) => {
      const rows = await prisma.warehouse.findMany({
        where: { storeId },
        orderBy: [{ isDefault: "desc" }, { priority: "asc" }, { createdAt: "asc" }],
        select: { id: true, code: true, name: true, status: true, isDefault: true, priority: true },
      });
      return rows.map(toWarehouseRef);
    },
    findWarehouse: async (storeId, warehouseId) => {
      const w = await prisma.warehouse.findFirst({
        where: { id: warehouseId, storeId },
        select: { id: true, code: true, name: true, status: true, isDefault: true, priority: true },
      });
      return w ? toWarehouseRef(w) : null;
    },
    findDefaultWarehouse: async (storeId) => {
      const w = await prisma.warehouse.findFirst({
        where: { storeId, isDefault: true },
        select: { id: true, code: true, name: true, status: true, isDefault: true, priority: true },
      });
      return w ? toWarehouseRef(w) : null;
    },
    read: (fn) => prisma.$transaction((tx) => fn(makeTxContext(tx))),
    transaction: (fn) => prisma.$transaction((tx) => fn(makeTxContext(tx))),
    listStoreVariants: (storeId, warehouse, criteria) =>
      readStoreVariants(storeId, warehouse, criteria),
  };
}
