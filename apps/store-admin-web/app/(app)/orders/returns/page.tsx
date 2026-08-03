"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  Input,
  PageHeader,
  Select,
  SkeletonRows,
  useLocale,
} from "../../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  type DataGridColumn,
} from "../../../../components/data-grid";
import { format, getDictionary } from "@commerce-os/i18n";
import type { AdminListPagination, AdminReturnListItem } from "@commerce-os/api-client";
import { ADMIN_LIST_PAGE_SIZE_OPTIONS } from "@commerce-os/api-client";
import { ReturnIcon } from "../../../../components/icons";
import { storeApi, type AdminListRequestQuery } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";
import { MetricGrid, MetricTile, SurfaceCard } from "../../../components/premium";
import {
  RETURN_STATUS_TONES,
  RETURN_RESOLUTION_TONES,
  RETURN_STATUS_VALUES,
  RETURN_RESOLUTION_VALUES,
  RETURN_REASON_VALUES,
  returnStatusLabel,
  returnResolutionLabel,
  returnReasonLabel,
  type ReturnStatus,
  type ReturnResolutionType,
  type ReturnReason,
} from "../order-shared";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AdminReturnListItem[]; pagination: AdminListPagination };

const DETAIL_LINK_CLASS =
  "inline-flex h-8 items-center justify-center gap-2 rounded-lg px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/[0.06] hover:text-white/90";

// SLA gecikme eşiği gateway ile AYNI (ageDays >= 3 → geciken). Yalnız gösterge; renk tek sinyal değil.
const OVERDUE_AGE_DAYS = 3;

const SETTLED_STATUSES: ReturnStatus[] = [
  "COMPLETED",
  "REJECTED",
  "CANCELLED_BY_CUSTOMER",
  "EXPIRED",
  "CLOSED",
];

const SORT_VALUES = ["requestedAt", "returnWindowEndsAt", "status"] as const;
type SortBy = (typeof SORT_VALUES)[number];

type ReturnFilters = {
  status: string;
  resolutionType: string;
  reason: string;
  orderNumber: string;
  overdue: boolean;
};

type ReturnView = { page: number; pageSize: number; sortBy: SortBy; sortOrder: "asc" | "desc" };

const DEFAULT_VIEW: ReturnView = {
  page: 1,
  pageSize: 25,
  sortBy: "requestedAt",
  sortOrder: "desc",
};

const EMPTY_FILTERS: ReturnFilters = {
  status: "",
  resolutionType: "",
  reason: "",
  orderNumber: "",
  overdue: false,
};

function readFilters(params: { get(name: string): string | null }): ReturnFilters {
  return {
    status: params.get("status") ?? "",
    resolutionType: params.get("resolutionType") ?? "",
    reason: params.get("reason") ?? "",
    orderNumber: params.get("orderNumber")?.trim() ?? "",
    overdue: params.get("overdue") === "true",
  };
}

function readView(params: { get(name: string): string | null }): ReturnView {
  const rawPageSize = Number.parseInt(params.get("pageSize") ?? "", 10);
  const pageSize = (ADMIN_LIST_PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
    ? rawPageSize
    : DEFAULT_VIEW.pageSize;
  const rawPage = Number.parseInt(params.get("page") ?? "", 10);
  const sortBy = params.get("sortBy");
  const sortOrder = params.get("sortOrder");
  return {
    page: Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1,
    pageSize,
    sortBy: sortBy && (SORT_VALUES as readonly string[]).includes(sortBy) ? (sortBy as SortBy) : DEFAULT_VIEW.sortBy,
    sortOrder: sortOrder === "asc" ? "asc" : "desc",
  };
}

// Yalnız daraltan (filtre) alanları taşıyan Record — activeCount ve API/URL için tek kaynak.
function filterRecord(f: ReturnFilters): AdminListRequestQuery {
  const q: AdminListRequestQuery = {};
  if ((RETURN_STATUS_VALUES as string[]).includes(f.status)) q.status = f.status;
  if ((RETURN_RESOLUTION_VALUES as string[]).includes(f.resolutionType)) {
    q.resolutionType = f.resolutionType;
  }
  if ((RETURN_REASON_VALUES as string[]).includes(f.reason)) q.reason = f.reason;
  if (f.orderNumber) q.orderNumber = f.orderNumber;
  if (f.overdue) q.overdue = "true";
  return q;
}

function toQuery(f: ReturnFilters, view?: ReturnView): AdminListRequestQuery {
  const q = filterRecord(f);
  if (view) {
    if (view.page > 1) q.page = view.page;
    if (view.pageSize !== DEFAULT_VIEW.pageSize) q.pageSize = view.pageSize;
    if (view.sortBy !== DEFAULT_VIEW.sortBy) q.sortBy = view.sortBy;
    if (view.sortOrder !== DEFAULT_VIEW.sortOrder) q.sortOrder = view.sortOrder;
  }
  return q;
}

function queryString(q: AdminListRequestQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(q)) {
    if (value === undefined || value === "") continue;
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export default function ReturnsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={4} />}>
      <ReturnsView />
    </Suspense>
  );
}

function ReturnsView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;
  const isTr = locale === "tr";

  const appliedFilters = useMemo(() => readFilters(searchParams), [searchParams]);
  const view = useMemo(() => readView(searchParams), [searchParams]);
  const query = useMemo(() => toQuery(appliedFilters, view), [appliedFilters, view]);
  const activeCount = Object.keys(filterRecord(appliedFilters)).length;

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [form, setForm] = useState<ReturnFilters>(appliedFilters);

  useEffect(() => {
    setForm(appliedFilters);
  }, [appliedFilters]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listReturns(query);
      setState({ status: "ready", rows: result.data, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, query]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      router.replace(`/orders/returns${queryString(toQuery(form, { ...view, page: 1 }))}`);
    },
    [form, router, view],
  );

  const clearFilters = useCallback(() => {
    setForm(EMPTY_FILTERS);
    router.replace(`/orders/returns${queryString(toQuery(EMPTY_FILTERS, { ...view, page: 1 }))}`);
  }, [router, view]);

  const updateView = useCallback(
    (patch: Partial<ReturnView>) => {
      const next: ReturnView = { ...view, ...patch };
      if (patch.sortBy !== undefined || patch.sortOrder !== undefined || patch.pageSize !== undefined) {
        next.page = 1;
      }
      router.replace(`/orders/returns${queryString(toQuery(appliedFilters, next))}`);
    },
    [appliedFilters, router, view],
  );

  const rows = state.status === "ready" ? state.rows : [];

  // Görünen sayfadan hızlı özet (mağaza-geneli kesin toplam = sayfalama çubuğu).
  const pageMetrics = useMemo(() => {
    let open = 0;
    let overdue = 0;
    for (const r of rows) {
      const settled = (SETTLED_STATUSES as string[]).includes(r.status);
      if (!settled) open += 1;
      if (!settled && r.ageDays >= OVERDUE_AGE_DAYS) overdue += 1;
    }
    return { open, overdue };
  }, [rows]);

  const columns: DataGridColumn<AdminReturnListItem>[] = [
    {
      // Sıralama allowlist'te iade no yok → bu kolon talep tarihine göre sıralar (hücrede iade no + tarih).
      key: "requestedAt",
      sortable: true,
      header: isTr ? "İade No" : "Return no",
      className: "whitespace-nowrap",
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium tracking-tight text-white/90">{r.returnNumber}</p>
          <p className="text-xs text-white/30">{formatDate(r.requestedAt)}</p>
        </div>
      ),
    },
    {
      key: "orderNumber",
      header: isTr ? "Sipariş No" : "Order no",
      className: "whitespace-nowrap",
      cell: (r) => <span className="font-mono text-sm text-white/70">{r.orderNumber}</span>,
    },
    {
      key: "customer",
      header: isTr ? "Müşteri" : "Customer",
      className: "max-w-[16rem]",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-white/80" title={r.customerName ?? undefined}>
            {r.customerName ?? (isTr ? "—" : "—")}
          </p>
          {r.customerEmail ? (
            <p className="truncate text-xs text-white/30" title={r.customerEmail}>
              {r.customerEmail}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: "items",
      header: isTr ? "Ürün / Adet" : "Items / Qty",
      className: "whitespace-nowrap",
      cell: (r) => (
        <span className="text-white/45">
          {isTr
            ? `${r.itemCount} kalem · ${r.totalQuantity} adet`
            : `${r.itemCount} items · ${r.totalQuantity} qty`}
        </span>
      ),
    },
    {
      key: "resolutionType",
      header: isTr ? "Çözüm" : "Resolution",
      className: "whitespace-nowrap",
      cell: (r) => (
        <Badge tone={RETURN_RESOLUTION_TONES[r.resolutionType]}>
          {returnResolutionLabel(r.resolutionType, locale)}
        </Badge>
      ),
    },
    {
      key: "status",
      sortable: true,
      header: isTr ? "Durum" : "Status",
      className: "whitespace-nowrap",
      cell: (r) => (
        <Badge tone={RETURN_STATUS_TONES[r.status]}>{returnStatusLabel(r.status, locale)}</Badge>
      ),
    },
    {
      key: "returnWindowEndsAt",
      sortable: true,
      header: isTr ? "Son Tarih" : "Window ends",
      className: "whitespace-nowrap",
      cell: (r) => <span className="text-white/45">{formatDate(r.returnWindowEndsAt)}</span>,
    },
    {
      key: "sla",
      header: "SLA",
      className: "whitespace-nowrap",
      cell: (r) => {
        const settled = (SETTLED_STATUSES as string[]).includes(r.status);
        const overdue = !settled && r.ageDays >= OVERDUE_AGE_DAYS;
        const label = isTr ? `${r.ageDays} gün` : `${r.ageDays}d`;
        // Metin her zaman görünür; rozet tonu yalnız ek gösterge (renk tek sinyal değil).
        return (
          <Badge tone={overdue ? "danger" : "neutral"}>
            {overdue ? (isTr ? `Gecikti · ${label}` : `Overdue · ${label}`) : label}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: isTr ? "İşlem" : "Action",
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => (
        <div className="flex justify-end">
          <Link href={`/orders/returns/${r.id}`} className={DETAIL_LINK_CLASS}>
            {isTr ? "Detay" : "Detail"}
          </Link>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={isTr ? "Satış" : "Sales"}
        title={isTr ? "İadeler" : "Returns"}
        description={
          isTr
            ? "Müşteri iade taleplerini inceleyin, onaylayın, teslim alın ve sonuçlandırın."
            : "Review, approve, receive and resolve customer return requests."
        }
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            {c.actions.refresh}
          </Button>
        }
      />

      {state.status === "ready" && rows.length > 0 ? (
        <div className="mb-5">
          <MetricGrid columns={3}>
            <MetricTile
              label={isTr ? "Toplam" : "Total"}
              value={state.pagination.totalItems}
              hint={isTr ? "Filtreye uyan kayıt" : "Records matching filters"}
              tone="brand"
            />
            <MetricTile
              label={isTr ? "Açık (bu sayfa)" : "Open (this page)"}
              value={pageMetrics.open}
              hint={isTr ? "Sonuçlanmamış talep" : "Not yet settled"}
            />
            <MetricTile
              label={isTr ? "Geciken (bu sayfa)" : "Overdue (this page)"}
              value={pageMetrics.overdue}
              hint={isTr ? `${OVERDUE_AGE_DAYS}+ gün açık` : `${OVERDUE_AGE_DAYS}+ days open`}
              tone="danger"
            />
          </MetricGrid>
        </div>
      ) : null}

      <div className="mb-5">
        <SurfaceCard
          title={isTr ? "Filtreler" : "Filters"}
          description={
            activeCount > 0
              ? format(g.filtersActive, { count: activeCount })
              : undefined
          }
        >
          <form onSubmit={applyFilters} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                id="returns-filter-status"
                label={isTr ? "Durum" : "Status"}
                value={form.status}
                onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
                options={[
                  { value: "", label: g.filterAll },
                  ...RETURN_STATUS_VALUES.map((value) => ({
                    value,
                    label: returnStatusLabel(value as ReturnStatus, locale),
                  })),
                ]}
              />
              <Select
                id="returns-filter-resolution"
                label={isTr ? "Çözüm Türü" : "Resolution"}
                value={form.resolutionType}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, resolutionType: event.target.value }))
                }
                options={[
                  { value: "", label: g.filterAll },
                  ...RETURN_RESOLUTION_VALUES.map((value) => ({
                    value,
                    label: returnResolutionLabel(value as ReturnResolutionType, locale),
                  })),
                ]}
              />
              <Select
                id="returns-filter-reason"
                label={isTr ? "Neden" : "Reason"}
                value={form.reason}
                onChange={(event) => setForm((prev) => ({ ...prev, reason: event.target.value }))}
                options={[
                  { value: "", label: g.filterAll },
                  ...RETURN_REASON_VALUES.map((value) => ({
                    value,
                    label: returnReasonLabel(value as ReturnReason, locale),
                  })),
                ]}
              />
              <Input
                id="returns-filter-order"
                label={isTr ? "Sipariş No" : "Order no"}
                placeholder={isTr ? "ör. ORD-1024" : "e.g. ORD-1024"}
                value={form.orderNumber}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, orderNumber: event.target.value }))
                }
              />
              <label className="flex items-end gap-2 pb-2 text-sm text-white/70">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-white/20 bg-transparent"
                  checked={form.overdue}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, overdue: event.target.checked }))
                  }
                />
                {isTr ? "Yalnız gecikenler (SLA)" : "Overdue only (SLA)"}
              </label>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={clearFilters}
                disabled={activeCount === 0}
              >
                {g.filtersClear}
              </Button>
              <Button type="submit">{g.filtersApply}</Button>
            </div>
          </form>
        </SurfaceCard>
      </div>

      <SurfaceCard
        title={isTr ? "İade Talepleri" : "Return requests"}
        description={
          state.status === "ready"
            ? format(g.rangeLabel, {
                from: state.pagination.totalItems === 0 ? 0 : state.pagination.offset + 1,
                to: Math.min(
                  state.pagination.offset + state.pagination.pageSize,
                  state.pagination.totalItems,
                ),
                total: state.pagination.totalItems,
              })
            : undefined
        }
        icon={<ReturnIcon />}
      >
        <DataGrid
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={activeCount > 0}
          caption={isTr ? "İade Talepleri" : "Return requests"}
          sortBy={view.sortBy}
          sortOrder={view.sortOrder}
          onSortChange={(sortBy, sortOrder) => updateView({ sortBy: sortBy as SortBy, sortOrder })}
          emptyIcon={<ReturnIcon />}
          labels={{
            loading: g.loading,
            errorTitle: g.errorTitle,
            retry: c.actions.retry,
            emptyTitle: isTr ? "Henüz iade yok" : "No returns yet",
            emptyDescription: isTr
              ? "Bu mağazada henüz iade talebi bulunmuyor."
              : "There are no return requests for this store yet.",
            emptyFilteredTitle: g.emptyFilteredTitle,
            emptyFilteredDescription: g.emptyFilteredDescription,
            selectRow: g.selectRow,
            selectAll: g.selectAll,
          }}
        />

        {state.status === "ready" ? (
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
            page={state.pagination.page}
            pageSize={state.pagination.pageSize}
            totalItems={state.pagination.totalItems}
            totalPages={state.pagination.totalPages}
            onPageChange={(page) => updateView({ page })}
            onPageSizeChange={(pageSize) => updateView({ pageSize })}
          />
        ) : null}
      </SurfaceCard>
    </>
  );
}
