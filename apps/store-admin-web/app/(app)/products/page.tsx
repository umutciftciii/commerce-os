"use client";

/**
 * TODO-159A (ADR-089) — Ürünler ekranı ortak Admin Data Grid'e taşındı.
 *
 * Eski davranış: `listProducts()` argümansız çağrılıyordu; gateway varsayılanı
 * gereği YALNIZ ilk 50 kayıt geliyor, kullanıcıya bunun bir sayfa olduğu hiçbir
 * yerde söylenmiyordu (471 ürünlük katalogda 421 ürün sessizce görünmezdi) ve
 * arama/filtre/sıralama hiç yoktu.
 *
 * Yeni davranış: arama, filtreler, sıralama ve sayfalama SUNUCUDA uygulanır;
 * durumun tamamı URL'de yaşar. İstemcide `slice`/`filter`/`sort` YAPILMAZ.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Modal,
  PageHeader,
  SkeletonRows,
  useLocale,
} from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
  type DataGridFilterDef,
  type DataGridSortOption,
} from "../../../components/data-grid";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  AdminListPagination,
  Product,
  ProductCategory,
  ProductPriceVisibility,
  ProductPrimaryAction,
  ProductSalesMode,
} from "@commerce-os/api-client";
import { ProductIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { SurfaceCard } from "../../components/premium";
import { ProductForm } from "./product-form";

type ProductStatus = Product["status"];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; products: Product[]; pagination: AdminListPagination };

const STATUS_TONES: Record<ProductStatus, "success" | "neutral" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "neutral",
  ARCHIVED: "warning",
};

const SALES_MODE_TONES: Record<ProductSalesMode, "success" | "info" | "warning" | "neutral"> = {
  ONLINE: "success",
  INQUIRY: "info",
  APPOINTMENT: "warning",
  WHATSAPP: "success",
  CATALOG_ONLY: "neutral",
};

// Detay/düzenle = `/products/[id]` (modal değil). Liste sadece linkler.
const DETAIL_LINK_CLASS =
  "inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-white/[0.11] bg-white/[0.06] px-3 text-xs font-semibold text-white/60 transition-colors hover:bg-white/[0.1] hover:text-white/80";

const SALES_MODES: ProductSalesMode[] = [
  "ONLINE",
  "INQUIRY",
  "APPOINTMENT",
  "WHATSAPP",
  "CATALOG_ONLY",
];
const STATUSES: ProductStatus[] = ["DRAFT", "ACTIVE", "ARCHIVED"];

/** URL'deki `sortBy`/`sortOrder` çiftinin araç çubuğundaki bileşik değeri. */
const SORT_VALUES = [
  "createdAt:desc",
  "createdAt:asc",
  "title:asc",
  "title:desc",
  "price:asc",
  "price:desc",
  "stock:asc",
  "stock:desc",
] as const;

const FILTER_KEYS = [
  "status",
  "salesMode",
  "purchasable",
  "categoryId",
  "brand",
  "vendor",
  "stockStatus",
  "priceMin",
  "priceMax",
] as const;

type ProductFilters = Record<(typeof FILTER_KEYS)[number], string>;

export default function ProductsPage() {
  // useSearchParams (Data Grid URL state) Suspense sınırı ister.
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <ProductsView />
    </Suspense>
  );
}

function ProductsView() {
  const router = useRouter();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;
  const sm = t.salesModel;
  const statusLabels = t.statusLabels as Record<ProductStatus, string>;

  const grid = useDataGridQuery<ProductFilters>({
    basePath: "/products",
    sortOptions: ["createdAt", "updatedAt", "title", "price", "stock"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: FILTER_KEYS,
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  // Kategori ve marka/tedarikçi seçenekleri filtre açılırlarını besler; listeden
  // BAĞIMSIZ yüklenir (sayfalanmış veriden türetilemez).
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [filterOptions, setFilterOptions] = useState<{ brands: string[]; vendors: string[] }>({
    brands: [],
    vendors: [],
  });
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Query nesnesi her render'da yeniden kurulur; serileştirilmiş hâli bağımlılık
  // anahtarıdır (aynı URL durumunda gereksiz istek tekrarı olmaz).
  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const products = await storeApi.listProducts(requestQuery);
      setState({ status: "ready", products: products.data, pagination: products.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Filtre kaynakları bir kez yüklenir; liste sorgusundan bağımsızdır.
    // Kategori seçenekleri için üst sınır (100) bilinçlidir — daha derin kategori
    // ağaçlarında arama tabanlı seçici gerekir (bkz. TD-093).
    void (async () => {
      try {
        const [cats, options] = await Promise.all([
          storeApi.listCategories({ pageSize: 100, sortBy: "name", sortOrder: "asc" }),
          storeApi.listProductFilterOptions(),
        ]);
        setCategories(cats.data);
        setFilterOptions(options);
      } catch {
        // Filtre kaynakları yüklenemezse liste yine çalışır (filtreler boş kalır).
      }
    })();
  }, []);

  const categoryNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const category of categories) map.set(category.id, category.name);
    return map;
  }, [categories]);

  const filters: DataGridFilterDef[] = useMemo(
    () => [
      {
        kind: "select",
        key: "status",
        label: t.grid.filters.status,
        options: STATUSES.map((value) => ({ value, label: statusLabels[value] })),
      },
      {
        kind: "select",
        key: "salesMode",
        label: t.grid.filters.salesMode,
        options: SALES_MODES.map((value) => ({ value, label: sm.modeLabels[value] })),
      },
      {
        kind: "select",
        key: "purchasable",
        label: t.grid.filters.purchasable,
        options: [
          { value: "true", label: t.grid.purchasableLabels.true },
          { value: "false", label: t.grid.purchasableLabels.false },
        ],
      },
      {
        kind: "select",
        key: "categoryId",
        label: t.grid.filters.category,
        options: categories.map((category) => ({ value: category.id, label: category.name })),
      },
      {
        kind: "select",
        key: "brand",
        label: t.grid.filters.brand,
        options: filterOptions.brands.map((value) => ({ value, label: value })),
      },
      {
        kind: "select",
        key: "vendor",
        label: t.grid.filters.vendor,
        options: filterOptions.vendors.map((value) => ({ value, label: value })),
      },
      {
        kind: "select",
        key: "stockStatus",
        label: t.grid.filters.stockStatus,
        options: [
          { value: "IN_STOCK", label: t.grid.stockStatusLabels.IN_STOCK },
          { value: "OUT_OF_STOCK", label: t.grid.stockStatusLabels.OUT_OF_STOCK },
        ],
      },
      {
        kind: "number-range",
        minKey: "priceMin",
        maxKey: "priceMax",
        label: t.grid.filters.price,
        minPlaceholder: t.grid.filters.priceMin,
        maxPlaceholder: t.grid.filters.priceMax,
      },
    ],
    [categories, filterOptions, sm.modeLabels, statusLabels, t.grid],
  );

  const sortOptions: DataGridSortOption[] = [
    { value: "createdAt:desc", label: t.grid.sort.newest },
    { value: "createdAt:asc", label: t.grid.sort.oldest },
    { value: "title:asc", label: t.grid.sort.titleAsc },
    { value: "title:desc", label: t.grid.sort.titleDesc },
    { value: "price:asc", label: t.grid.sort.priceAsc },
    { value: "price:desc", label: t.grid.sort.priceDesc },
    { value: "stock:asc", label: t.grid.sort.stockAsc },
    { value: "stock:desc", label: t.grid.sort.stockDesc },
  ];

  const sortValue = `${grid.sortBy}:${grid.sortOrder}`;
  const activeSortValue = (SORT_VALUES as readonly string[]).includes(sortValue)
    ? sortValue
    : "createdAt:desc";

  const columns: DataGridColumn<Product>[] = [
    {
      key: "title",
      header: t.table.title,
      sortable: true,
      cell: (product) => (
        <div>
          <p className="font-medium text-white/90">{product.title}</p>
          <p className="font-mono text-xs text-white/30">{product.slug}</p>
        </div>
      ),
    },
    {
      key: "status",
      header: t.table.status,
      cell: (product) => (
        <Badge tone={STATUS_TONES[product.status]}>{statusLabels[product.status]}</Badge>
      ),
    },
    {
      key: "salesMode",
      header: sm.columnHeader,
      cell: (product) => {
        // Eski (F2D oncesi) kayitlar icin guvenli varsayilanlar.
        const mode = (product.salesMode ?? "ONLINE") as ProductSalesMode;
        const visibility = (product.priceVisibility ?? "VISIBLE") as ProductPriceVisibility;
        const action = (product.primaryAction ?? "ADD_TO_CART") as ProductPrimaryAction;
        const purchasable = product.purchasable ?? true;
        return (
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge tone={SALES_MODE_TONES[mode]} dot>
                {sm.modeLabels[mode]}
              </Badge>
              {!purchasable ? (
                <Badge tone="warning">{sm.notPurchasableBadge}</Badge>
              ) : mode === "ONLINE" ? (
                <Badge tone="success">{sm.purchasableBadge}</Badge>
              ) : null}
            </div>
            <p className="text-xs text-white/30">
              {sm.priceVisibilityLabels[visibility]} · {sm.actionLabels[action]}
            </p>
          </div>
        );
      },
    },
    {
      key: "brand",
      header: t.table.brand,
      cell: (product) => (
        <span className="text-white/45">{product.brand ?? product.vendor ?? t.noBrand}</span>
      ),
    },
    {
      key: "categories",
      header: t.table.categories,
      cell: (product) => (
        <span className="text-white/45">
          {product.categoryIds.length === 0
            ? "—"
            : product.categoryIds.map((id) => categoryNameById.get(id) ?? id).join(", ")}
        </span>
      ),
    },
    {
      key: "actions",
      header: t.table.actions,
      align: "right",
      cell: (product) => (
        <div className="flex justify-end gap-2">
          <Link href={`/products/${product.id}`} className={DETAIL_LINK_CLASS}>
            {t.detailAction}
          </Link>
        </div>
      ),
    },
  ];

  const pagination = state.status === "ready" ? state.pagination : null;

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button onClick={() => setCreating(true)}>{t.addProduct}</Button>}
      />

      {notice ? (
        <div className="mb-4">
          <Alert
            tone="success"
            action={
              <button
                type="button"
                className="text-emerald-300 underline"
                onClick={() => setNotice(null)}
              >
                {c.actions.dismiss}
              </button>
            }
          >
            {notice}
          </Alert>
        </div>
      ) : null}

      <SurfaceCard
        title={t.cardTitle}
        description={
          pagination ? format(t.countLabel, { count: pagination.totalItems }) : t.cardDescription
        }
        icon={<ProductIcon />}
      >
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
          onFiltersChange={(next) => grid.setFilters(next as Partial<ProductFilters>)}
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
          rows={state.status === "ready" ? state.products : []}
          rowKey={(product) => product.id}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption={t.cardTitle}
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<ProductIcon />}
          emptyAction={
            <Button size="sm" onClick={() => setCreating(true)}>
              {t.emptyAction}
            </Button>
          }
          labels={{
            loading: g.loading,
            errorTitle: t.loadError,
            retry: c.actions.retry,
            emptyTitle: t.emptyTitle,
            emptyDescription: t.emptyDescription,
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
      </SurfaceCard>

      {creating ? (
        <CreateProduct
          categories={categories}
          statusLabels={statusLabels}
          onClose={() => setCreating(false)}
          onCreated={(product) => {
            setCreating(false);
            // Create sonrasi: edit modal degil, dedicated detail route'una yonlendir.
            router.push(`/products/${product.id}`);
          }}
        />
      ) : null}
    </>
  );
}

/** Kısa create modal'ı (kural: kısa create/edit modal kalabilir). */
function CreateProduct({
  categories,
  statusLabels,
  onClose,
  onCreated,
}: {
  categories: ProductCategory[];
  statusLabels: Record<ProductStatus, string>;
  onClose: () => void;
  onCreated: (product: Product) => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.products;
  const c = dict.common;
  const f = t.form;
  const [saving, setSaving] = useState(false);

  return (
    <Modal
      open
      onClose={onClose}
      title={f.createTitle}
      description={f.createSubtitle}
      closeLabel={c.actions.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {c.actions.cancel}
          </Button>
          <Button type="submit" form="product-create-form" disabled={saving}>
            {saving ? c.states.saving : f.submitCreate}
          </Button>
        </>
      }
    >
      <ProductForm
        mode="create"
        categories={categories}
        statusLabels={statusLabels}
        formId="product-create-form"
        onSavingChange={setSaving}
        onSaved={(_message, product) => onCreated(product)}
      />
    </Modal>
  );
}
