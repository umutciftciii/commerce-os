// TODO-165 Fashion Vertical (ADR-249) — Size Chart servisi (tek yazar).
//
// Store/kategori/urun scope beden olcu tablosu; DRAFT calisma kopyasi + IMMUTABLE publish
// revizyonlari + rollback. Tenant-scoped (tum sorgular {id, storeId}; cross-store 404).
// sizeSystemKey kod-seviyesi SIZE_SYSTEM_REGISTRY ile dogrulanir. columns/rows PLAIN-TEXT
// (raw HTML/CSS/JS reddedilir — sunum guvenligi). Saf dogrulama + enjekte dataAccess.

import { isSizeSystemKey, isValidSizeValue, type SizeSystemKey } from "@commerce-os/contracts/size-systems";

export type SizeChartStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type SizeChartScope = "STORE" | "CATEGORY" | "PRODUCT";

export interface SizeChartColumn {
  key: string;
  label: string;
  unit?: string;
}
export interface SizeChartRow {
  size: string;
  cells: Record<string, string | number>;
}

export interface SizeChartRevisionRecord {
  id: string;
  revision: number;
  columns: SizeChartColumn[];
  rows: SizeChartRow[];
  locale: string | null;
  createdAt: Date;
}
export interface SizeChartAssignmentRecord {
  id: string;
  scope: SizeChartScope;
  categoryId: string | null;
  productId: string | null;
}
export interface SizeChartRecord {
  id: string;
  storeId: string;
  name: string;
  sizeSystemKey: string;
  measurementUnit: string;
  gender: string | null;
  locale: string | null;
  status: SizeChartStatus;
  publishedRevisionId: string | null;
  draftColumns: SizeChartColumn[];
  draftRows: SizeChartRow[];
  createdAt: Date;
  updatedAt: Date;
  publishedRevision?: SizeChartRevisionRecord | null;
  assignments?: SizeChartAssignmentRecord[];
}

/**
 * TODO-165A Tasks 25/26 (perf) — `resolveEffective`'in DAR sonuç şekli. Hot PDP yolunda
 * `SizeChartDataAccess.get()`'in TAMAMI (tüm revizyonlar + atamalar) YERİNE yalnız gösterim
 * + yayınlı revizyon alanları taşınır — draftColumns/draftRows/assignments/diğer revizyonlar
 * YOKTUR (resolution için gerekmezler).
 */
export interface SizeChartResolutionRecord {
  id: string;
  name: string;
  sizeSystemKey: string;
  measurementUnit: string;
  gender: string | null;
  status: SizeChartStatus;
  publishedRevisionId: string | null;
  publishedRevision: SizeChartRevisionRecord;
}

export type SizeChartErrorCode =
  | "SIZE_CHART_NOT_FOUND"
  | "SIZE_SYSTEM_UNKNOWN"
  | "SIZE_CHART_INVALID_CONTENT"
  | "SIZE_CHART_EMPTY_DRAFT"
  | "SIZE_CHART_REVISION_NOT_FOUND"
  | "SIZE_CHART_ASSIGN_TARGET_INVALID"
  | "SIZE_CHART_ASSIGN_CROSS_STORE"
  | "SIZE_CHART_ASSIGN_NOT_PUBLISHED"
  | "SIZE_CHART_ARCHIVED";

export class SizeChartError extends Error {
  constructor(
    public code: SizeChartErrorCode,
    message: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SizeChartError";
  }
}

export function sizeChartErrorStatus(code: SizeChartErrorCode): number {
  switch (code) {
    case "SIZE_CHART_NOT_FOUND":
    case "SIZE_CHART_REVISION_NOT_FOUND":
      return 404;
    case "SIZE_CHART_ASSIGN_CROSS_STORE":
      return 403;
    default:
      return 400;
  }
}

// ── Pure content validation ──────────────────────────────────────────────────
// Kolon key'leri benzersiz; her satirin cells'i yalniz tanimli kolon key'lerini kullanir;
// hucre degerleri string|number; beden degeri (opsiyonel) size-system'e karsi dogrulanir;
// raw markup (< >) reddedilir (zod'a ek server-side kalkan).

const MARKUP = /[<>]/;

export function validateSizeChartContent(
  sizeSystemKey: string,
  columns: SizeChartColumn[],
  rows: SizeChartRow[],
  opts: { enforceSizeValues?: boolean } = {},
): void {
  const keys = new Set<string>();
  for (const c of columns) {
    if (!c.key || MARKUP.test(c.key) || !/^[a-zA-Z0-9_-]+$/.test(c.key)) {
      throw new SizeChartError("SIZE_CHART_INVALID_CONTENT", `Invalid column key: ${c.key}`);
    }
    if (keys.has(c.key)) {
      throw new SizeChartError("SIZE_CHART_INVALID_CONTENT", `Duplicate column key: ${c.key}`);
    }
    if (MARKUP.test(c.label) || (c.unit && MARKUP.test(c.unit))) {
      throw new SizeChartError("SIZE_CHART_INVALID_CONTENT", "Markup not allowed in column");
    }
    keys.add(c.key);
  }
  const seenSizes = new Set<string>();
  for (const r of rows) {
    if (!r.size || MARKUP.test(r.size)) {
      throw new SizeChartError("SIZE_CHART_INVALID_CONTENT", "Invalid or markup size value");
    }
    if (seenSizes.has(r.size)) {
      throw new SizeChartError("SIZE_CHART_INVALID_CONTENT", `Duplicate size row: ${r.size}`);
    }
    seenSizes.add(r.size);
    if (opts.enforceSizeValues && isSizeSystemKey(sizeSystemKey)) {
      if (!isValidSizeValue(sizeSystemKey as SizeSystemKey, r.size)) {
        throw new SizeChartError("SIZE_CHART_INVALID_CONTENT", `Size "${r.size}" not in system ${sizeSystemKey}`, {
          size: r.size,
        });
      }
    }
    for (const [cellKey, value] of Object.entries(r.cells ?? {})) {
      if (!keys.has(cellKey)) {
        throw new SizeChartError("SIZE_CHART_INVALID_CONTENT", `Cell references unknown column: ${cellKey}`);
      }
      if (typeof value === "string" && MARKUP.test(value)) {
        throw new SizeChartError("SIZE_CHART_INVALID_CONTENT", "Markup not allowed in cell");
      }
    }
  }
}

// ── Selector (TODO-165A Task 13, ADR-090 desenini mirror eder) ────────────────
// `ids` verildiginde arama/durum/siralama YOK SAYILIR — cozum modu (bkz.
// AdminProductSelectorCriteria/BrandSelectorCriteria).
export type SizeChartSelectorSortBy = "name" | "createdAt";

export interface SizeChartSelectorCriteria {
  limit: number;
  offset: number;
  search?: string;
  status?: SizeChartStatus;
  sortBy?: SizeChartSelectorSortBy;
  sortOrder?: "asc" | "desc";
  /** Cozum modu: verilirse YALNIZ bu id'ler (magaza icinde) doner. */
  ids?: string[];
}

// ── Data access ──────────────────────────────────────────────────────────────
export interface SizeChartDataAccess {
  list(storeId: string): Promise<SizeChartRecord[]>;
  get(storeId: string, id: string): Promise<SizeChartRecord | null>;
  create(input: {
    storeId: string;
    name: string;
    sizeSystemKey: string;
    measurementUnit: string;
    gender: string | null;
    locale: string | null;
    draftColumns: SizeChartColumn[];
    draftRows: SizeChartRow[];
  }): Promise<SizeChartRecord>;
  updateDraft(
    storeId: string,
    id: string,
    patch: Partial<{
      name: string;
      measurementUnit: string;
      gender: string | null;
      locale: string | null;
      draftColumns: SizeChartColumn[];
      draftRows: SizeChartRow[];
    }>,
  ): Promise<SizeChartRecord>;
  /** Advisory-lock altinda: sonraki revision no'yu al, revizyon yarat, chart'i PUBLISHED yap. */
  publish(
    storeId: string,
    id: string,
    snapshot: { columns: SizeChartColumn[]; rows: SizeChartRow[]; locale: string | null },
  ): Promise<SizeChartRecord>;
  getRevision(storeId: string, chartId: string, revisionId: string): Promise<SizeChartRevisionRecord | null>;
  setStatus(storeId: string, id: string, status: SizeChartStatus): Promise<SizeChartRecord>;
  /** publishedRevisionId + draft'i verilen revizyona geri al. */
  rollback(storeId: string, id: string, revision: SizeChartRevisionRecord): Promise<SizeChartRecord>;
  upsertAssignment(input: {
    storeId: string;
    sizeChartId: string;
    scope: SizeChartScope;
    categoryId: string | null;
    productId: string | null;
  }): Promise<SizeChartAssignmentRecord>;
  removeAssignment(storeId: string, sizeChartId: string, assignmentId: string): Promise<void>;
  categoryExists(storeId: string, categoryId: string): Promise<boolean>;
  productExists(storeId: string, productId: string): Promise<boolean>;
  /** TODO-165A Task 13 — dual `?ids=` / arama-sayfalama secici (ADR-090 desenini mirror eder). */
  selector(storeId: string, criteria: SizeChartSelectorCriteria): Promise<{ data: SizeChartRecord[]; total: number }>;
  /**
   * TODO-165A Tasks 25/26 — Bir urunun DOGRUDAN (PRODUCT-scope) atamasini productId ile
   * bulur (chart-id degil urun-id ile arama; mevcut `get`/`assign` chart-id merkezlidir).
   */
  findProductAssignment(
    storeId: string,
    productId: string,
  ): Promise<{ assignmentId: string; sizeChartId: string } | null>;
  /**
   * TODO-165A Tasks 25/26 — PRODUCT/CATEGORY/STORE hedeflerine ait HAM atama satirlari
   * (public-projection.ts'teki `resolvePublishedSizeChart` ile AYNI sorgu sekli; oncelik
   * siralamasi CAGIRANDA yapilir — bkz. `resolveEffectiveSizeChart`). Tek precedence
   * uygulamasi bu ikisi arasinda PAYLASILIR; paralel bir kopya YAZILMAZ.
   */
  findResolutionCandidates(
    storeId: string,
    productId: string,
    categoryId: string | null,
  ): Promise<{ scope: SizeChartScope; sizeChartId: string }[]>;
  /**
   * TODO-165A Tasks 25/26 (perf fix) — precedence KARARI için DAR chart meta'sı (status +
   * publishedRevisionId + gösterim alanları); revizyonlar/atamalar dahil DEĞİLDİR. Hot PDP
   * yolunda `get()`'in ağır `include: { revisions, assignments }`'ı YERİNE kullanılır —
   * `resolveEffective` her aday için bunu çağırır, YALNIZ kazanan için `getRevision`'ı ekler.
   */
  getResolutionMeta(
    storeId: string,
    id: string,
  ): Promise<Pick<
    SizeChartRecord,
    "id" | "name" | "sizeSystemKey" | "measurementUnit" | "gender" | "status" | "publishedRevisionId"
  > | null>;
}

export interface SizeChartService {
  list(storeId: string): Promise<SizeChartRecord[]>;
  get(storeId: string, id: string): Promise<SizeChartRecord>;
  create(storeId: string, input: SizeChartCreateInput): Promise<SizeChartRecord>;
  update(storeId: string, id: string, patch: SizeChartUpdateInput): Promise<SizeChartRecord>;
  publish(storeId: string, id: string): Promise<SizeChartRecord>;
  rollback(storeId: string, id: string, revisionId: string): Promise<SizeChartRecord>;
  archive(storeId: string, id: string): Promise<SizeChartRecord>;
  assign(storeId: string, id: string, input: SizeChartAssignInput): Promise<SizeChartAssignmentRecord>;
  unassign(storeId: string, id: string, assignmentId: string): Promise<void>;
  /** TODO-165A Task 13 — SEÇİCİ ucu (store-admin urun formu + merkezi AssignModal). */
  selector(storeId: string, criteria: SizeChartSelectorCriteria): Promise<{ data: SizeChartRecord[]; total: number }>;
  /** TODO-165A Tasks 25/26 — urun formunun "guncel baglanti" karti icin PRODUCT-scope atama + chart. */
  findProductAssignment(
    storeId: string,
    productId: string,
  ): Promise<{ assignmentId: string; chart: SizeChartRecord } | null>;
  /**
   * TODO-165A Tasks 25/26 — PRODUCT>CATEGORY>STORE oncelikli ÇÖZÜMLENMİŞ atama (yalnız
   * PUBLISHED + publishedRevisionId'li chart kazanir). `public-projection.ts`'in
   * `resolvePublishedSizeChart`'ı BU fonksiyonu cagirir — tek precedence uygulamasi.
   */
  resolveEffective(
    storeId: string,
    productId: string,
    categoryId: string | null,
  ): Promise<{ scope: SizeChartScope; chart: SizeChartResolutionRecord } | null>;
}

export interface SizeChartCreateInput {
  name: string;
  sizeSystemKey: string;
  measurementUnit?: string;
  gender?: string | null;
  locale?: string | null;
  columns?: SizeChartColumn[];
  rows?: SizeChartRow[];
}
export interface SizeChartUpdateInput {
  name?: string;
  measurementUnit?: string;
  gender?: string | null;
  locale?: string | null;
  columns?: SizeChartColumn[];
  rows?: SizeChartRow[];
}
export interface SizeChartAssignInput {
  scope: SizeChartScope;
  categoryId?: string | null;
  productId?: string | null;
}

export function createSizeChartService(dataAccess: SizeChartDataAccess): SizeChartService {
  async function requireChart(storeId: string, id: string): Promise<SizeChartRecord> {
    const chart = await dataAccess.get(storeId, id);
    if (!chart) throw new SizeChartError("SIZE_CHART_NOT_FOUND", "Size chart not found");
    return chart;
  }

  return {
    list: (storeId) => dataAccess.list(storeId),
    get: (storeId, id) => requireChart(storeId, id),

    async create(storeId, input) {
      if (!isSizeSystemKey(input.sizeSystemKey)) {
        throw new SizeChartError("SIZE_SYSTEM_UNKNOWN", `Unknown size system: ${input.sizeSystemKey}`);
      }
      const columns = input.columns ?? [];
      const rows = input.rows ?? [];
      validateSizeChartContent(input.sizeSystemKey, columns, rows);
      return dataAccess.create({
        storeId,
        name: input.name,
        sizeSystemKey: input.sizeSystemKey,
        measurementUnit: input.measurementUnit ?? "CM",
        gender: input.gender ?? null,
        locale: input.locale ?? null,
        draftColumns: columns,
        draftRows: rows,
      });
    },

    async update(storeId, id, patch) {
      const chart = await requireChart(storeId, id);
      if (chart.status === "ARCHIVED") {
        throw new SizeChartError("SIZE_CHART_ARCHIVED", "Cannot edit an archived size chart");
      }
      const columns = patch.columns ?? chart.draftColumns;
      const rows = patch.rows ?? chart.draftRows;
      validateSizeChartContent(chart.sizeSystemKey, columns, rows);
      return dataAccess.updateDraft(storeId, id, {
        name: patch.name,
        measurementUnit: patch.measurementUnit,
        gender: patch.gender,
        locale: patch.locale,
        draftColumns: patch.columns ? columns : undefined,
        draftRows: patch.rows ? rows : undefined,
      });
    },

    async publish(storeId, id) {
      const chart = await requireChart(storeId, id);
      if (chart.status === "ARCHIVED") {
        throw new SizeChartError("SIZE_CHART_ARCHIVED", "Cannot publish an archived size chart");
      }
      if (!chart.draftColumns.length || !chart.draftRows.length) {
        throw new SizeChartError("SIZE_CHART_EMPTY_DRAFT", "Draft has no columns/rows to publish");
      }
      // enforceSizeValues=true: yayin aninda beden degerleri sisteme uygun olmali.
      validateSizeChartContent(chart.sizeSystemKey, chart.draftColumns, chart.draftRows, {
        enforceSizeValues: true,
      });
      return dataAccess.publish(storeId, id, {
        columns: chart.draftColumns,
        rows: chart.draftRows,
        locale: chart.locale,
      });
    },

    async rollback(storeId, id, revisionId) {
      await requireChart(storeId, id);
      const revision = await dataAccess.getRevision(storeId, id, revisionId);
      if (!revision) throw new SizeChartError("SIZE_CHART_REVISION_NOT_FOUND", "Revision not found");
      return dataAccess.rollback(storeId, id, revision);
    },

    async archive(storeId, id) {
      await requireChart(storeId, id);
      return dataAccess.setStatus(storeId, id, "ARCHIVED");
    },

    async assign(storeId, id, input) {
      const chart = await requireChart(storeId, id);
      // TODO-165A Task 13 (spec §9) — yalniz PUBLISHED chart baglanabilir: DRAFT (henuz
      // yayinlanmamis) veya ARCHIVED chart, resolvePublishedSizeChart'ta zaten cozulemez;
      // burada ERKEN reddedilir ki UI net bir 400 alsin (sessiz-hicbir-sey-olmaz yerine).
      if (chart.status !== "PUBLISHED") {
        throw new SizeChartError(
          "SIZE_CHART_ASSIGN_NOT_PUBLISHED",
          "Only a published size chart can be assigned",
        );
      }
      let categoryId: string | null = null;
      let productId: string | null = null;
      if (input.scope === "CATEGORY") {
        if (!input.categoryId) {
          throw new SizeChartError("SIZE_CHART_ASSIGN_TARGET_INVALID", "categoryId required for CATEGORY scope");
        }
        if (!(await dataAccess.categoryExists(storeId, input.categoryId))) {
          throw new SizeChartError("SIZE_CHART_ASSIGN_CROSS_STORE", "Category not found in this store");
        }
        categoryId = input.categoryId;
      } else if (input.scope === "PRODUCT") {
        if (!input.productId) {
          throw new SizeChartError("SIZE_CHART_ASSIGN_TARGET_INVALID", "productId required for PRODUCT scope");
        }
        if (!(await dataAccess.productExists(storeId, input.productId))) {
          throw new SizeChartError("SIZE_CHART_ASSIGN_CROSS_STORE", "Product not found in this store");
        }
        productId = input.productId;
      }
      return dataAccess.upsertAssignment({ storeId, sizeChartId: id, scope: input.scope, categoryId, productId });
    },

    async unassign(storeId, id, assignmentId) {
      await requireChart(storeId, id);
      await dataAccess.removeAssignment(storeId, id, assignmentId);
    },

    selector: (storeId, criteria) => dataAccess.selector(storeId, criteria),

    async findProductAssignment(storeId, productId) {
      const found = await dataAccess.findProductAssignment(storeId, productId);
      if (!found) return null;
      const chart = await dataAccess.get(storeId, found.sizeChartId);
      if (!chart) return null;
      return { assignmentId: found.assignmentId, chart };
    },

    async resolveEffective(storeId, productId, categoryId) {
      const candidates = await dataAccess.findResolutionCandidates(storeId, productId, categoryId);
      // Oncelik: PRODUCT > CATEGORY > STORE (public-projection.ts ile AYNI siralama).
      const rank = (scope: SizeChartScope) => (scope === "PRODUCT" ? 0 : scope === "CATEGORY" ? 1 : 2);
      const sorted = [...candidates].sort((a, b) => rank(a.scope) - rank(b.scope));
      // Perf (hot PDP yolu): her aday icin DAR meta (`getResolutionMeta`) — tam `get()`
      // (tum revizyonlar + atamalar) DEGIL. Yalniz KAZANAN icin (yayinli) revizyon govdesi
      // ayrica `getRevision` ile cekilir — diger adaylarin/revizyonlarin govdesi HIC YUKLENMEZ.
      for (const candidate of sorted) {
        const meta = await dataAccess.getResolutionMeta(storeId, candidate.sizeChartId);
        if (!meta || meta.status !== "PUBLISHED" || !meta.publishedRevisionId) continue;
        const revision = await dataAccess.getRevision(storeId, candidate.sizeChartId, meta.publishedRevisionId);
        if (!revision) continue;
        return {
          scope: candidate.scope,
          chart: {
            id: meta.id,
            name: meta.name,
            sizeSystemKey: meta.sizeSystemKey,
            measurementUnit: meta.measurementUnit,
            gender: meta.gender,
            status: meta.status,
            publishedRevisionId: meta.publishedRevisionId,
            publishedRevision: revision,
          },
        };
      }
      return null;
    },
  };
}
