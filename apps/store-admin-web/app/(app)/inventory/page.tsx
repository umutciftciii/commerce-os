"use client";

// TODO-152A — GLOBAL STOK: mağaza-geneli izleme & operasyon merkezi.
// TODO-159C (ADR-092) — SUNUCU-OTORİTER liste. Eski davranış: tüm mağaza matrisi (enterprise-demo:
// 2.202 varyant) TEK yanıtta gelir, arama/durum filtresi istemcide yapılır, KPI'lar tüm dataset'ten
// hesaplanırdı. Yeni davranış: arama/filtre/sıralama/sayfalama SUNUCUDA (ADR-089 Data Grid); durumun
// tamamı URL'de yaşar; KPI'lar sunucunun sayfadan BAĞIMSIZ `summary`'sinden gelir. İstemcide
// slice/filter/sort YAPILMAZ.
//
// Düzenleme (Quick Edit / Bulk / Preview / Apply) ADR-076 gereği ürün-bazlı kalır: her satır o ürünün
// Stok sekmesine tek-tık geçer. Güvenli tek-satır hızlı işlemler (+/−/sıfırla) mevcut ürün-bazlı
// preview→apply uçlarını kullanır (yeni fan-out yazma motoru YOK).

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  InventoryStoreMatrixRow,
  InventoryStoreMatrixSummary,
  InventoryWarehouse,
  AdminListPagination,
} from "@commerce-os/api-client";
import { Alert, Button, PageHeader, SkeletonRows, useLocale } from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
  type DataGridFilterDef,
  type DataGridSortOption,
} from "../../../components/data-grid";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { pw, PRICING_ROOT } from "../products/pricing/pricing-tokens";
import { fmt, Kpi, StatusBadge, WarehouseSelector } from "../products/inventory/shared";

/** Tek-satır hızlı işlem adımı (onHand +/−). Sıfırla = SET_ABSOLUTE 0. */
const QUICK_STEP = 10;

// URL'deki `sortBy`/`sortOrder` çiftinin araç çubuğundaki bileşik değeri (allowlist).
const SORT_VALUES = [
  "productTitle:asc",
  "productTitle:desc",
  "sku:asc",
  "sku:desc",
  "onHand:desc",
  "onHand:asc",
  "reserved:desc",
  "reserved:asc",
  "available:desc",
  "available:asc",
  "updatedAt:desc",
  "updatedAt:asc",
] as const;

// warehouseId liste durumunun parçasıdır (URL'de yaşar, değişince page 1'e döner); WarehouseSelector
// ile sunulur (araç çubuğu filtre çipi olarak DEĞİL). Diğerleri gerçek sunucu-taraflı filtrelerdir.
const FILTER_KEYS = [
  "warehouseId",
  "stockStatus",
  "reserved",
  "variantStatus",
  "productStatus",
] as const;

type InventoryFilters = Record<(typeof FILTER_KEYS)[number], string>;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      rows: InventoryStoreMatrixRow[];
      warehouse: InventoryWarehouse;
      pagination: AdminListPagination;
      summary: InventoryStoreMatrixSummary;
    };

export default function InventoryPage() {
  // useSearchParams (Data Grid URL state) Suspense sınırı ister.
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <InventoryView />
    </Suspense>
  );
}

function InventoryView() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.inventory;
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;

  const grid = useDataGridQuery<InventoryFilters>({
    basePath: "/inventory",
    sortOptions: ["productTitle", "sku", "onHand", "reserved", "available", "updatedAt"],
    defaultSortBy: "productTitle",
    defaultSortOrder: "asc",
    filterKeys: FILTER_KEYS,
  });

  const [warehouses, setWarehouses] = useState<InventoryWarehouse[]>([]);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actingVariantId, setActingVariantId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<InventoryStoreMatrixRow | null>(null);

  // Aynı URL durumunda gereksiz istek tekrarını önlemek için serileştirilmiş anahtar.
  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    setError(null);
    try {
      const matrix = await storeApi.getStoreInventoryMatrix(requestQuery);
      setState({
        status: "ready",
        rows: matrix.rows,
        warehouse: matrix.warehouse,
        pagination: matrix.pagination,
        summary: matrix.summary,
      });
    } catch (err) {
      setState({ status: "error", message: messageForError(err, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  // Depo listesi bir kez yüklenir (selector kaynağı); liste sorgusundan bağımsız.
  useEffect(() => {
    void (async () => {
      try {
        const whList = await storeApi.listWarehouses();
        setWarehouses(whList.data);
      } catch {
        // Depo listesi yüklenemezse matris yine çalışır (aktif depo response'tan gelir).
      }
    })();
  }, []);

  const warehouse = state.status === "ready" ? state.warehouse : null;
  const warehouseInactive = warehouse?.status === "INACTIVE";
  const summary = state.status === "ready" ? state.summary : null;
  const pagination = state.status === "ready" ? state.pagination : null;

  // Depo seçimi liste durumunun parçasıdır: varsayılan depo seçilince URL temiz kalsın diye "" yazılır
  // (sunucu default'u çözer), aksi halde id. Değişim page'i 1'e döndürür (setFilter içinde).
  const onSelectWarehouse = (id: string) => {
    const picked = warehouses.find((w) => w.id === id);
    grid.setFilter("warehouseId", picked?.isDefault ? "" : id);
  };

  const filters: DataGridFilterDef[] = useMemo(
    () => [
      {
        kind: "select",
        key: "stockStatus",
        label: t.grid.filters.stockStatus,
        options: [
          { value: "IN_STOCK", label: t.stockStatus.IN_STOCK },
          { value: "LOW_STOCK", label: t.stockStatus.LOW_STOCK },
          { value: "OUT_OF_STOCK", label: t.stockStatus.OUT_OF_STOCK },
          { value: "INCOMING", label: t.stockStatus.INCOMING },
          { value: "NEGATIVE", label: t.stockStatus.NEGATIVE },
          { value: "NO_BALANCE", label: t.stockStatus.NO_BALANCE },
        ],
      },
      {
        kind: "select",
        key: "reserved",
        label: t.grid.filters.reserved,
        options: [
          { value: "yes", label: t.grid.reservedLabels.yes },
          { value: "no", label: t.grid.reservedLabels.no },
        ],
      },
      {
        kind: "select",
        key: "variantStatus",
        label: t.grid.filters.variantStatus,
        options: [
          { value: "DRAFT", label: t.statusLabels.DRAFT },
          { value: "ACTIVE", label: t.statusLabels.ACTIVE },
        ],
      },
      {
        kind: "select",
        key: "productStatus",
        label: t.grid.filters.productStatus,
        options: [
          { value: "DRAFT", label: t.statusLabels.DRAFT },
          { value: "ACTIVE", label: t.statusLabels.ACTIVE },
          { value: "ARCHIVED", label: t.statusLabels.ARCHIVED },
        ],
      },
    ],
    [t.grid, t.stockStatus, t.statusLabels],
  );

  const sortOptions: DataGridSortOption[] = [
    { value: "productTitle:asc", label: t.grid.sort.productAsc },
    { value: "productTitle:desc", label: t.grid.sort.productDesc },
    { value: "sku:asc", label: t.grid.sort.skuAsc },
    { value: "sku:desc", label: t.grid.sort.skuDesc },
    { value: "onHand:desc", label: t.grid.sort.onHandDesc },
    { value: "onHand:asc", label: t.grid.sort.onHandAsc },
    { value: "reserved:desc", label: t.grid.sort.reservedDesc },
    { value: "reserved:asc", label: t.grid.sort.reservedAsc },
    { value: "available:desc", label: t.grid.sort.availableDesc },
    { value: "available:asc", label: t.grid.sort.availableAsc },
    { value: "updatedAt:desc", label: t.grid.sort.updatedNewest },
    { value: "updatedAt:asc", label: t.grid.sort.updatedOldest },
  ];

  const sortValue = `${grid.sortBy}:${grid.sortOrder}`;
  const activeSortValue = (SORT_VALUES as readonly string[]).includes(sortValue)
    ? sortValue
    : "productTitle:asc";

  const quickDisabled = warehouseInactive || actingVariantId !== null;

  /* ── güvenli tek-satır hızlı işlem: ürün-bazlı preview→apply (ADR-076 korunur) ── */
  const runQuickAdjust = useCallback(
    async (row: InventoryStoreMatrixRow, nextOnHand: number) => {
      if (!warehouse) return;
      setActingVariantId(row.variantId);
      setError(null);
      setNotice(null);
      try {
        const edits = [{ variantId: row.variantId, onHand: nextOnHand }];
        const preview = await storeApi.previewInventory(row.productId, {
          warehouseId: warehouse.id,
          edits,
        });
        if (preview.blocked) {
          setError(t.quick.blockedToast);
          return;
        }
        await storeApi.applyInventory(row.productId, {
          warehouseId: warehouse.id,
          baseFingerprint: preview.fingerprint,
          edits,
        });
        setNotice(
          t.quick.appliedToast
            .replace("{title}", row.productTitle)
            .replace("{old}", fmt(row.current.onHand, locale))
            .replace("{new}", fmt(nextOnHand, locale)),
        );
        await load();
      } catch (err) {
        setError(messageForError(err, locale));
      } finally {
        setActingVariantId(null);
      }
    },
    [warehouse, locale, t, load],
  );

  const confirmReset = async () => {
    const row = resetTarget;
    setResetTarget(null);
    if (row) await runQuickAdjust(row, 0);
  };

  const columns: DataGridColumn<InventoryStoreMatrixRow>[] = [
    {
      key: "productTitle",
      header: t.col.product,
      sortable: true,
      cell: (row) => (
        <Link
          href={`/products/${row.productId}?tab=inventory`}
          className={`font-medium ${pw.ink} underline-offset-2 hover:underline`}
          title={t.row.openStockTab}
        >
          {row.productTitle}
        </Link>
      ),
    },
    {
      key: "variant",
      header: t.col.variant,
      cell: (row) => (
        <span className={pw.muted}>
          {row.attributes.length > 0 ? row.attributes.map((a) => a.label).join(" · ") : row.title}
        </span>
      ),
    },
    {
      key: "sku",
      header: t.col.sku,
      sortable: true,
      cell: (row) => <span className={`font-mono text-xs ${pw.faint}`}>{row.sku}</span>,
    },
    {
      key: "onHand",
      header: t.col.onHand,
      sortable: true,
      align: "right",
      cell: (row) => <span className={pw.ink}>{fmt(row.current.onHand, locale)}</span>,
    },
    {
      key: "reserved",
      header: t.col.reserved,
      sortable: true,
      align: "right",
      cell: (row) => <span className={pw.faint}>{fmt(row.current.reserved, locale)}</span>,
    },
    {
      key: "safetyStock",
      header: t.col.safetyStock,
      align: "right",
      cell: (row) => <span className={pw.ink}>{fmt(row.current.safetyStock, locale)}</span>,
    },
    {
      key: "available",
      header: t.col.sellable,
      sortable: true,
      align: "right",
      cell: (row) => (
        <span className={`font-medium ${pw.success}`}>
          {fmt(row.currentCalc.sellableAvailable, locale)}
        </span>
      ),
    },
    {
      key: "incoming",
      header: t.col.incoming,
      align: "right",
      cell: (row) => <span className={pw.ink}>{fmt(row.current.incoming, locale)}</span>,
    },
    {
      key: "reorderPoint",
      header: t.col.reorderPoint,
      align: "right",
      cell: (row) => <span className={pw.ink}>{fmt(row.current.reorderPoint, locale)}</span>,
    },
    {
      key: "status",
      header: t.col.status,
      cell: (row) => (
        <StatusBadge status={row.currentCalc.status} label={t.stockStatus[row.currentCalc.status]} />
      ),
    },
    {
      key: "actions",
      header: t.col.actions,
      align: "right",
      cell: (row) => {
        const busy = actingVariantId === row.variantId;
        const disabled = quickDisabled;
        return (
          <div className="flex items-center justify-end gap-1">
            <QuickButton
              label={`−${QUICK_STEP}`}
              title={t.quick.decrease}
              onClick={() => void runQuickAdjust(row, Math.max(0, row.current.onHand - QUICK_STEP))}
              disabled={disabled || busy}
            />
            <QuickButton
              label={`+${QUICK_STEP}`}
              title={t.quick.increase}
              onClick={() => void runQuickAdjust(row, row.current.onHand + QUICK_STEP)}
              disabled={disabled || busy}
            />
            <QuickButton
              label={t.quick.reset}
              title={t.quick.reset}
              onClick={() => setResetTarget(row)}
              disabled={disabled || busy}
              tone="danger"
            />
            <Link
              href={`/products/${row.productId}?tab=inventory`}
              className={`ml-1 rounded-md border ${pw.line} px-2 py-1 text-xs font-medium ${pw.accent} ${pw.hover} transition-colors`}
              title={t.row.openStockTab}
            >
              {t.row.manage} <span aria-hidden>→</span>
            </Link>
          </div>
        );
      },
    },
  ];

  return (
    <div className={`${PRICING_ROOT} ${pw.ink}`}>
      <PageHeader eyebrow={t.eyebrow} title={t.title} description={t.description} />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className={pw.accent} onClick={() => setNotice(null)}>
                {c.actions.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}
      {error ? (
        <div className="mb-4">
          <Alert
            tone="error"
            action={
              <button type="button" className={pw.accent} onClick={() => setError(null)}>
                {c.actions.dismiss}
              </button>
            }
          >
            {error}
          </Alert>
        </div>
      ) : null}

      <div className="space-y-5">
        {/* Depo seçici (Product Detail > Stok ile ortak component) */}
        <WarehouseSelector
          labels={{
            label: t.warehouse.label,
            defaultBadge: t.warehouse.defaultBadge,
            inactiveBadge: t.warehouse.statusInactive,
            none: t.warehouse.none,
          }}
          warehouses={warehouses}
          active={warehouse}
          onSelect={onSelectWarehouse}
        />

        {warehouseInactive ? <Alert tone="warning">{t.warehouse.inactiveNote}</Alert> : null}

        {/* KPI kartları — sunucunun sayfadan BAĞIMSIZ summary'sinden (aktif filtreyle tutarlı) */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Kpi label={t.kpi.onHand} value={fmt(summary?.totalOnHand ?? 0, locale)} />
          <Kpi label={t.kpi.reserved} value={fmt(summary?.totalReserved ?? 0, locale)} />
          <Kpi label={t.kpi.sellable} value={fmt(summary?.totalSellable ?? 0, locale)} tone="success" />
          <Kpi label={t.kpi.incoming} value={fmt(summary?.totalIncoming ?? 0, locale)} tone="info" />
          <Kpi
            label={t.kpi.lowStock}
            value={fmt(summary?.lowStock ?? 0, locale)}
            tone={(summary?.lowStock ?? 0) > 0 ? "warning" : "neutral"}
          />
          <Kpi
            label={t.kpi.outOfStock}
            value={fmt(summary?.outOfStock ?? 0, locale)}
            tone={(summary?.outOfStock ?? 0) > 0 ? "warning" : "neutral"}
          />
        </div>

        {pagination ? (
          <p className={`text-xs ${pw.faint}`}>{format(t.count, { count: pagination.totalItems })}</p>
        ) : null}

        <DataGridToolbar
          labels={{
            searchPlaceholder: t.grid.searchPlaceholder,
            searchLabel: g.searchLabel,
            searchSubmit: g.searchSubmit,
            filters: g.filters,
            filtersApply: g.filtersApply,
            filtersClear: g.filtersClear,
            filterAll: g.filterAll,
            removeFilter: g.removeFilter,
            sortLabel: g.sortLabel,
          }}
          search={grid.search}
          onSearchChange={grid.setSearch}
          filters={filters}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<InventoryFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={sortOptions}
          sortValue={activeSortValue}
          onSortChange={(value) => {
            const [sortBy, sortOrder] = value.split(":");
            grid.setSort(sortBy, sortOrder === "asc" ? "asc" : "desc");
          }}
        />

        <DataGrid
          columns={columns}
          rows={state.status === "ready" ? state.rows : []}
          rowKey={(row) => row.variantId}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption={t.title}
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          labels={{
            loading: g.loading,
            errorTitle: t.states.loadError,
            retry: c.actions.retry,
            emptyTitle: t.states.empty,
            emptyDescription: t.states.empty,
            emptyFilteredTitle: g.emptyFilteredTitle,
            emptyFilteredDescription: g.emptyFilteredDescription,
            selectRow: g.selectRow,
            selectAll: g.selectAll,
          }}
        />

        {pagination ? (
          <DataGridPagination
            labels={{
              rangeLabel: g.rangeLabel,
              rangeEmpty: g.rangeEmpty,
              previousPage: g.previousPage,
              nextPage: g.nextPage,
              pageSizeLabel: g.pageSizeLabel,
              goToPage: g.goToPage,
              pageOf: g.pageOf,
            }}
            page={pagination.page}
            pageSize={pagination.pageSize}
            totalItems={pagination.totalItems}
            totalPages={pagination.totalPages}
            onPageChange={grid.setPage}
            onPageSizeChange={grid.setPageSize}
          />
        ) : null}
      </div>

      {resetTarget ? (
        <ResetConfirm
          row={resetTarget}
          labels={t}
          cancelLabel={c.actions.cancel}
          onCancel={() => setResetTarget(null)}
          onConfirm={() => void confirmReset()}
        />
      ) : null}
    </div>
  );
}

/* ───────────────────────────── satır aksiyonları ───────────────────────────── */

type InventoryDict = ReturnType<typeof getDictionary>["storeAdmin"]["inventory"];

function QuickButton({
  label,
  title,
  onClick,
  disabled,
  tone = "neutral",
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled: boolean;
  tone?: "neutral" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
        tone === "danger" ? `${pw.line} ${pw.danger} ${pw.hover}` : `${pw.line} ${pw.ink} ${pw.hover}`
      }`}
    >
      {label}
    </button>
  );
}

/* ───────────────────────────── sıfırla onayı ───────────────────────────── */

function ResetConfirm({
  row,
  labels,
  cancelLabel,
  onCancel,
  onConfirm,
}: {
  row: InventoryStoreMatrixRow;
  labels: InventoryDict;
  cancelLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal>
      <div className={`${PRICING_ROOT} ${pw.ink} w-full max-w-md rounded-xl border ${pw.lineStrong} ${pw.surfaceRaised} p-5`}>
        <h3 className={`text-base font-semibold ${pw.ink}`}>{labels.quick.resetConfirmTitle}</h3>
        <p className={`mt-2 text-sm ${pw.muted}`}>
          {labels.quick.resetConfirmBody
            .replace("{product}", row.productTitle)
            .replace(
              "{variant}",
              row.attributes.length > 0 ? row.attributes.map((a) => a.label).join(" · ") : row.title,
            )}
        </p>
        <div className="mt-5 flex items-center justify-end gap-3">
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button onClick={onConfirm}>{labels.quick.reset}</Button>
        </div>
      </div>
    </div>
  );
}
