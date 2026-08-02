"use client";

// TODO-165A (ADR-165A) Task 15/16 — Marka (Brand) yönetimi: liste (Data Grid) + oluşturma/
// düzenleme modalı + arşivle/geri-yükle + "Bağlı ürünler" modalı. `categories/page.tsx`
// deseninin (Data Grid + SectionCard + MediaUpload) birebir mirror'ı; CATALOG çekirdek/
// always-on modül olduğundan menüde her zaman görünür.

import { Suspense, useCallback, useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  SectionCard,
  SkeletonRows,
  useLocale,
} from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../components/data-grid";
import { getDictionary } from "@commerce-os/i18n";
import type { AdminListPagination, Brand } from "@commerce-os/api-client";
import { BrandIcon } from "../../../components/icons";
import { formatDate } from "../../../lib/client/format";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { BrandEditor, type BrandEditorState } from "./brand-editor";
import { BrandProductsModal } from "./brand-products-modal";

type BrandStatus = Brand["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; brands: Brand[]; pagination: AdminListPagination };

const EMPTY_BRANDS: Brand[] = [];

const STATUS_TONES: Record<BrandStatus, "success" | "neutral"> = {
  ACTIVE: "success",
  ARCHIVED: "neutral",
};
const STATUS_LABELS: Record<BrandStatus, string> = {
  ACTIVE: "Aktif",
  ARCHIVED: "Arşiv",
};

type BrandFilters = { status: string };

export default function BrandsPage() {
  // useSearchParams (Data Grid URL state) Suspense sınırı ister.
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <BrandsView />
    </Suspense>
  );
}

function BrandsView() {
  const locale = useLocale();
  const g = getDictionary(locale).storeAdmin.dataGrid;

  const grid = useDataGridQuery<BrandFilters>({
    basePath: "/brands",
    sortOptions: ["name", "createdAt", "productCount"],
    defaultSortBy: "name",
    defaultSortOrder: "asc",
    filterKeys: ["status"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editor, setEditor] = useState<BrandEditorState>(null);
  const [productsFor, setProductsFor] = useState<Brand | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const requestKey = JSON.stringify(grid.toRequestQuery());

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const query = JSON.parse(requestKey) as Record<string, string | number>;
      const result = await storeApi.listBrands(query);
      setState({ status: "ready", brands: result.data, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, requestKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const brands = state.status === "ready" ? state.brands : EMPTY_BRANDS;

  async function onToggleStatus(brand: Brand) {
    setBusyId(brand.id);
    try {
      if (brand.status === "ACTIVE") {
        await storeApi.archiveBrand(brand.id);
        setNotice("Marka arşivlendi.");
      } else {
        await storeApi.restoreBrand(brand.id);
        setNotice("Marka geri yüklendi.");
      }
      await load();
    } catch (error) {
      setNotice(null);
      setState({ status: "error", message: messageForError(error, locale) });
    } finally {
      setBusyId(null);
    }
  }

  const columns: DataGridColumn<Brand>[] = [
    {
      key: "logo",
      header: "Logo",
      cell: (brand) => (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/[0.1] bg-white/[0.04]">
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <BrandIcon />
          )}
        </span>
      ),
    },
    {
      key: "name",
      header: "Ad",
      sortable: true,
      cell: (brand) => (
        <div>
          <p className="font-medium text-white/90">{brand.name}</p>
          <p className="font-mono text-xs text-white/30">{brand.slug}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Durum",
      cell: (brand) => <Badge tone={STATUS_TONES[brand.status]}>{STATUS_LABELS[brand.status]}</Badge>,
    },
    {
      key: "productCount",
      header: "Ürün Sayısı",
      align: "right",
      sortable: true,
      cell: (brand) => (
        <button
          type="button"
          onClick={() => setProductsFor(brand)}
          className="text-white/60 underline decoration-white/20 underline-offset-2 transition-colors hover:text-white/90"
        >
          {brand.productCount}
        </button>
      ),
    },
    {
      key: "updatedAt",
      header: "Güncelleme",
      cell: (brand) => <span className="text-white/45">{formatDate(brand.updatedAt)}</span>,
    },
    {
      key: "actions",
      header: "İşlem",
      align: "right",
      cell: (brand) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setProductsFor(brand)}>
            Bağlı Ürünler
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setEditor({ mode: "edit", brand })}>
            Düzenle
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={busyId === brand.id}
            onClick={() => void onToggleStatus(brand)}
          >
            {busyId === brand.id ? "…" : brand.status === "ACTIVE" ? "Arşivle" : "Geri Yükle"}
          </Button>
        </div>
      ),
    },
  ];

  const sortOptions = [
    { value: "name:asc", label: "Ad (A-Z)" },
    { value: "name:desc", label: "Ad (Z-A)" },
    { value: "createdAt:desc", label: "En yeni" },
    { value: "createdAt:asc", label: "En eski" },
    { value: "productCount:desc", label: "Ürün sayısı (çok-az)" },
    { value: "productCount:asc", label: "Ürün sayısı (az-çok)" },
  ];

  const pagination = state.status === "ready" ? state.pagination : null;

  function onSaved(message: string) {
    setEditor(null);
    setNotice(message);
    void load();
  }

  return (
    <>
      <PageHeader
        eyebrow="Katalog"
        title="Markalar"
        description="Ürünlerinize bağlanacak markaları (logo, kapak görseli, web sitesi) yönetin."
        actions={<Button onClick={() => setEditor({ mode: "create" })}>Yeni Marka</Button>}
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button type="button" className="text-emerald-300 underline" onClick={() => setNotice(null)}>
                Kapat
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      <SectionCard
        title="Markalar"
        description={
          pagination ? `${pagination.totalItems} marka` : "Mağazanızın markaları"
        }
        icon={<BrandIcon />}
      >
        <DataGridToolbar
          labels={{
            searchPlaceholder: "Marka adı ara…",
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
          filters={[
            {
              kind: "select",
              key: "status",
              label: "Durum",
              options: (["ACTIVE", "ARCHIVED"] as BrandStatus[]).map((value) => ({
                value,
                label: STATUS_LABELS[value],
              })),
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<BrandFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={sortOptions}
          sortValue={`${grid.sortBy}:${grid.sortOrder}`}
          onSortChange={(value) => {
            const [sortBy, sortOrder] = value.split(":");
            grid.setSort(sortBy, sortOrder === "asc" ? "asc" : "desc");
          }}
        />

        <DataGrid
          columns={columns}
          rows={brands}
          rowKey={(brand) => brand.id}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption="Markalar"
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<BrandIcon />}
          emptyAction={
            <Button size="sm" onClick={() => setEditor({ mode: "create" })}>
              Yeni Marka
            </Button>
          }
          labels={{
            loading: g.loading,
            errorTitle: "Markalar yüklenemedi",
            retry: "Tekrar dene",
            emptyTitle: "Henüz marka yok",
            emptyDescription: "İlk markanızı oluşturarak ürünlere bağlayın.",
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
      </SectionCard>

      {editor ? <BrandEditor editor={editor} onClose={() => setEditor(null)} onSaved={onSaved} /> : null}

      {productsFor ? (
        <BrandProductsModal brand={productsFor} onClose={() => setProductsFor(null)} />
      ) : null}
    </>
  );
}
