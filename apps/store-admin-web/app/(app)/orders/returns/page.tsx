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
import type { AdminListPagination, AdminRefundVisibilityItem } from "@commerce-os/api-client";
import { ADMIN_LIST_PAGE_SIZE_OPTIONS } from "@commerce-os/api-client";
import { ReturnIcon } from "../../../../components/icons";
import { storeApi, type AdminListRequestQuery } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../lib/client/format";
import { MetricGrid, MetricTile, SurfaceCard } from "../../../components/premium";
import {
  RETURN_STATUS_TONES,
  RETURN_RESOLUTION_TONES,
  RETURN_STATUS_VALUES,
  RETURN_RESOLUTION_VALUES,
  RETURN_REASON_VALUES,
  REFUND_SOURCE_TONES,
  REFUND_STATUS_TONES,
  refundSourceLabel,
  refundStatusLabel,
  returnStatusLabel,
  returnResolutionLabel,
  returnReasonLabel,
  cancellationReasonLabel,
  type ReturnStatus,
  type ReturnResolutionType,
  type ReturnReason,
} from "../order-shared";

// TODO-174A — birleşik "İadeler" listesindeki kaynak (source) filtre değerleri.
const REFUND_SOURCE_VALUES = ["RETURN_REQUEST", "ORDER_CANCELLATION"] as const;

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AdminRefundVisibilityItem[]; pagination: AdminListPagination };

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

// TODO-174A — birleşik liste createdAt (requestedAt) ile sıralanır (kaynaklar-arası tek anlamlı anahtar).
const SORT_VALUES = ["requestedAt"] as const;
type SortBy = (typeof SORT_VALUES)[number];

type ReturnFilters = {
  status: string;
  resolutionType: string;
  reason: string;
  source: string;
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
  source: "",
  orderNumber: "",
  overdue: false,
};

function readFilters(params: { get(name: string): string | null }): ReturnFilters {
  return {
    status: params.get("status") ?? "",
    resolutionType: params.get("resolutionType") ?? "",
    reason: params.get("reason") ?? "",
    source: params.get("source") ?? "",
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
  if ((REFUND_SOURCE_VALUES as readonly string[]).includes(f.source)) q.source = f.source;
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
  // Açık = sonuçlanmamış iade talebi VEYA işlenmekte olan iptal geri ödemesi (PENDING/PROCESSING).
  const pageMetrics = useMemo(() => {
    let open = 0;
    let overdue = 0;
    for (const r of rows) {
      if (r.source === "RETURN_REQUEST") {
        const settled = r.returnStatus != null && (SETTLED_STATUSES as string[]).includes(r.returnStatus);
        if (!settled) open += 1;
        if (!settled && (r.ageDays ?? 0) >= OVERDUE_AGE_DAYS) overdue += 1;
      } else if (r.refundStatus === "PENDING" || r.refundStatus === "PROCESSING") {
        open += 1;
      }
    }
    return { open, overdue };
  }, [rows]);

  const columns: DataGridColumn<AdminRefundVisibilityItem>[] = [
    {
      // Sıralama birleşik createdAt (requestedAt). Hücrede referans (iade no / sipariş no) + tarih.
      key: "requestedAt",
      sortable: true,
      header: isTr ? "Kayıt" : "Record",
      className: "whitespace-nowrap",
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-mono text-sm font-medium tracking-tight text-white/90">{r.reference}</p>
          <p className="text-xs text-white/30">{formatDate(r.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "source",
      header: isTr ? "Kaynak" : "Source",
      className: "whitespace-nowrap",
      cell: (r) => (
        <Badge tone={REFUND_SOURCE_TONES[r.source]}>{refundSourceLabel(r.source, locale)}</Badge>
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
            {r.customerName ?? "—"}
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
      // Return: kalem/adet; Cancellation: iade tutarı (birleşik "özet" kolonu).
      key: "summary",
      header: isTr ? "Özet" : "Summary",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.source === "RETURN_REQUEST" ? (
          <span className="text-white/45">
            {isTr
              ? `${r.itemCount ?? 0} kalem · ${r.totalQuantity ?? 0} adet`
              : `${r.itemCount ?? 0} items · ${r.totalQuantity ?? 0} qty`}
          </span>
        ) : (
          <span className="text-white/80">
            {r.refundAmountMinor != null && r.currency
              ? formatMinor(r.refundAmountMinor, r.currency)
              : "—"}
          </span>
        ),
    },
    {
      // Return: iade durumu; Cancellation: geri ödeme durumu (birleşik "durum" kolonu).
      key: "status",
      header: isTr ? "Durum" : "Status",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.source === "RETURN_REQUEST" && r.returnStatus ? (
          <Badge tone={RETURN_STATUS_TONES[r.returnStatus]}>
            {returnStatusLabel(r.returnStatus, locale)}
          </Badge>
        ) : r.refundStatus ? (
          <Badge tone={REFUND_STATUS_TONES[r.refundStatus]}>
            {refundStatusLabel(r.refundStatus, locale)}
          </Badge>
        ) : (
          <span className="text-white/30">—</span>
        ),
    },
    {
      // Return: çözüm türü; Cancellation: iptal nedeni (insani label) — "return request" copy'si YOK.
      key: "detail",
      header: isTr ? "Çözüm / Neden" : "Resolution / Reason",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.source === "RETURN_REQUEST" && r.resolutionType ? (
          <Badge tone={RETURN_RESOLUTION_TONES[r.resolutionType]}>
            {returnResolutionLabel(r.resolutionType, locale)}
          </Badge>
        ) : r.cancellationReasonCode ? (
          <span className="text-white/60">
            {cancellationReasonLabel(r.cancellationReasonCode, locale)}
          </span>
        ) : (
          <span className="text-white/30">—</span>
        ),
    },
    {
      key: "sla",
      header: "SLA",
      className: "whitespace-nowrap",
      cell: (r) => {
        // SLA yalnız iade talebine uygulanır (iptal geri ödemesinde iade penceresi/yaşı yok).
        if (r.source !== "RETURN_REQUEST" || r.returnStatus == null || r.ageDays == null) {
          return <span className="text-white/30">—</span>;
        }
        const settled = (SETTLED_STATUSES as string[]).includes(r.returnStatus);
        const overdue = !settled && r.ageDays >= OVERDUE_AGE_DAYS;
        const label = isTr ? `${r.ageDays} gün` : `${r.ageDays}d`;
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
          <Link
            href={
              r.detailKind === "RETURN"
                ? `/orders/returns/${r.detailId}`
                : `/orders/${r.detailId}`
            }
            className={DETAIL_LINK_CLASS}
          >
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
            ? "İade taleplerini ve sipariş iptali geri ödemelerini tek listede inceleyin ve sonuçlandırın."
            : "Review and resolve return requests and order-cancellation refunds in one list."
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
                id="returns-filter-source"
                label={isTr ? "Kaynak" : "Source"}
                value={form.source}
                onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                options={[
                  { value: "", label: g.filterAll },
                  ...REFUND_SOURCE_VALUES.map((value) => ({
                    value,
                    label: refundSourceLabel(value, locale),
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
                  className="h-4 w-4 rounded border-white/20 bg-transparent accent-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/60"
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
        title={isTr ? "İadeler ve geri ödemeler" : "Returns & refunds"}
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
          rowKey={(r) => `${r.source}:${r.detailId}`}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={activeCount > 0}
          caption={isTr ? "İadeler ve geri ödemeler" : "Returns & refunds"}
          sortBy={view.sortBy}
          sortOrder={view.sortOrder}
          onSortChange={(sortBy, sortOrder) => updateView({ sortBy: sortBy as SortBy, sortOrder })}
          emptyIcon={<ReturnIcon />}
          labels={{
            loading: g.loading,
            errorTitle: g.errorTitle,
            retry: c.actions.retry,
            emptyTitle: isTr ? "Henüz kayıt yok" : "No records yet",
            emptyDescription: isTr
              ? "Bu mağazada henüz iade talebi veya sipariş iptali geri ödemesi bulunmuyor."
              : "There are no return requests or order-cancellation refunds for this store yet.",
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
