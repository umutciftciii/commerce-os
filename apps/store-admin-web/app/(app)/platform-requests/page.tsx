"use client";

/**
 * TODO-178 (Faz D) — Platform Talepleri listesi (mağaza → platform). Server-side pagination/arama/
 * filtre (status · kategori · SLA riski) BFF üzerinden; storeId server-context otoritesi. Ham enum/
 * key/UUID gösterilmez; INTERNAL içerik store DTO'suna zaten girmez. Priority/atama store'ca DEĞİŞMEZ.
 */
import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, SkeletonRows, useLocale } from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../components/data-grid";
import { getDictionary } from "@commerce-os/i18n";
import type {
  StorePlatformRequestCategoryListResponse,
  StorePlatformRequestListResponse,
} from "@commerce-os/api-client";
import { PlatformRequestIcon } from "../../../components/icons";
import { storeApi, UiError } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import {
  type Locale,
  categoryLabel,
  priorityLabel,
  priorityTone,
  slaStateLabel,
  slaStateTone,
  statusLabel,
  statusTone,
  STATUS_ORDER,
} from "../../../lib/client/platform-request-labels";

type Row = StorePlatformRequestListResponse["items"][number];
type CategoryRef = StorePlatformRequestCategoryListResponse["items"][number];

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: StorePlatformRequestListResponse };

const T = {
  title: { tr: "Platform Talepleri", en: "Platform Requests" },
  subtitle: {
    tr: "Platform ekibinden müdahale gereken konular için talep açın ve takip edin.",
    en: "Open and track requests that need the platform team's action.",
  },
  newRequest: { tr: "Yeni talep", en: "New request" },
  cardTitle: { tr: "Talepler", en: "Requests" },
  cardDesc: { tr: "Mağazanızın platform talepleri", en: "Your store's platform requests" },
  searchPlaceholder: { tr: "Talep no / konu ara", en: "Search by number / subject" },
  filterStatus: { tr: "Durum", en: "Status" },
  filterCategory: { tr: "Kategori", en: "Category" },
  filterSla: { tr: "SLA", en: "SLA" },
  slaAtRisk: { tr: "Riskli", en: "At risk" },
  colNumber: { tr: "Talep No", en: "Number" },
  colCategory: { tr: "Kategori", en: "Category" },
  colSubject: { tr: "Konu", en: "Subject" },
  colStatus: { tr: "Durum", en: "Status" },
  colPriority: { tr: "Öncelik", en: "Priority" },
  colAssignee: { tr: "Atanan", en: "Assignee" },
  colFirstSla: { tr: "İlk Yanıt", en: "First Response" },
  colResolutionSla: { tr: "Çözüm", en: "Resolution" },
  colActivity: { tr: "Son Aktivite", en: "Last Activity" },
  unassigned: { tr: "Atanmadı", en: "Unassigned" },
  emptyTitle: { tr: "Henüz talep yok", en: "No requests yet" },
  emptyDesc: { tr: "İlk platform talebinizi oluşturun.", en: "Create your first platform request." },
  errorTitle: { tr: "Talepler yüklenemedi", en: "Could not load requests" },
  sortNewest: { tr: "En yeni", en: "Newest" },
} as const;

export default function PlatformRequestsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <PlatformRequestsView />
    </Suspense>
  );
}

function PlatformRequestsView() {
  const locale = useLocale() as Locale;
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;
  const tr = (b: { tr: string; en: string }) => (locale === "tr" ? b.tr : b.en);

  const grid = useDataGridQuery<{ status: string; categoryKey: string; slaRisk: string }>({
    basePath: "/platform-requests",
    sortOptions: ["lastActivityAt"],
    defaultSortBy: "lastActivityAt",
    defaultSortOrder: "desc",
    filterKeys: ["status", "categoryKey", "slaRisk"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [categories, setCategories] = useState<CategoryRef[]>([]);

  useEffect(() => {
    let active = true;
    storeApi
      .listPlatformRequestCategories()
      .then((r) => {
        if (active) setCategories(r.items);
      })
      .catch(() => {
        // Kategori listesi yüklenemezse filtre boş kalır; liste yine çalışır.
      });
    return () => {
      active = false;
    };
  }, []);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listPlatformRequests(requestQuery);
      setState({ status: "ready", result });
    } catch (error) {
      const message =
        error instanceof UiError ? messageForError(error, locale) : messageForError(error, locale);
      setState({ status: "error", message });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.status === "ready" ? state.result.items : [];
  const result = state.status === "ready" ? state.result : null;

  const columns: DataGridColumn<Row>[] = [
    {
      key: "requestNumber",
      header: tr(T.colNumber),
      cell: (r) => (
        <Link
          href={`/platform-requests/${r.id}`}
          className="font-medium text-white/90 underline-offset-2 hover:text-indigo-200 hover:underline"
        >
          {r.requestNumber}
        </Link>
      ),
    },
    {
      key: "category",
      header: tr(T.colCategory),
      cell: (r) => <span className="text-white/60">{categoryLabel(locale, r.category)}</span>,
    },
    {
      key: "subject",
      header: tr(T.colSubject),
      cell: (r) => (
        <Link
          href={`/platform-requests/${r.id}`}
          className="text-white/80 underline-offset-2 hover:text-indigo-200 hover:underline"
        >
          {r.subject}
        </Link>
      ),
    },
    {
      key: "status",
      header: tr(T.colStatus),
      cell: (r) => <Badge tone={statusTone(r.status)}>{statusLabel(locale, r.status)}</Badge>,
    },
    {
      key: "priority",
      header: tr(T.colPriority),
      cell: (r) => <Badge tone={priorityTone(r.priority)}>{priorityLabel(locale, r.priority)}</Badge>,
    },
    {
      key: "assignee",
      header: tr(T.colAssignee),
      cell: (r) =>
        r.assigneeName ? (
          <span className="text-white/70">{r.assigneeName}</span>
        ) : (
          <span className="text-white/30">{tr(T.unassigned)}</span>
        ),
    },
    {
      key: "firstSla",
      header: tr(T.colFirstSla),
      cell: (r) =>
        r.sla ? (
          <Badge tone={slaStateTone(r.sla.firstResponseState)}>
            {slaStateLabel(locale, r.sla.firstResponseState)}
          </Badge>
        ) : (
          <span className="text-white/30">—</span>
        ),
    },
    {
      key: "resolutionSla",
      header: tr(T.colResolutionSla),
      cell: (r) =>
        r.sla ? (
          <Badge tone={slaStateTone(r.sla.resolutionState)}>
            {slaStateLabel(locale, r.sla.resolutionState)}
          </Badge>
        ) : (
          <span className="text-white/30">—</span>
        ),
    },
    {
      key: "lastActivityAt",
      header: tr(T.colActivity),
      cell: (r) => <span className="text-white/50">{formatDate(r.lastActivityAt)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-white/90">{tr(T.title)}</h1>
          <p className="text-sm text-white/50">{tr(T.subtitle)}</p>
        </div>
        <Link href="/platform-requests/new">
          <Button>{tr(T.newRequest)}</Button>
        </Link>
      </div>

      <SurfaceCard title={tr(T.cardTitle)} description={tr(T.cardDesc)} icon={<PlatformRequestIcon />}>
        <DataGridToolbar
          labels={{
            searchPlaceholder: tr(T.searchPlaceholder),
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
              label: tr(T.filterStatus),
              options: STATUS_ORDER.map((value) => ({ value, label: statusLabel(locale, value) })),
            },
            {
              kind: "select",
              key: "categoryKey",
              label: tr(T.filterCategory),
              options: categories.map((cat) => ({
                value: cat.key,
                label: categoryLabel(locale, cat),
              })),
            },
            {
              kind: "select",
              key: "slaRisk",
              label: tr(T.filterSla),
              options: [{ value: "true", label: tr(T.slaAtRisk) }],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) =>
            grid.setFilters(next as Partial<{ status: string; categoryKey: string; slaRisk: string }>)
          }
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[{ value: "lastActivityAt:desc", label: tr(T.sortNewest) }]}
          sortValue={`${grid.sortBy}:${grid.sortOrder}`}
          onSortChange={(value) => {
            const [sortBy, sortOrder] = value.split(":");
            grid.setSort(sortBy, sortOrder === "asc" ? "asc" : "desc");
          }}
        />
        <DataGrid
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption={tr(T.cardTitle)}
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<PlatformRequestIcon />}
          labels={{
            loading: g.loading,
            errorTitle: tr(T.errorTitle),
            retry: c.actions.retry,
            emptyTitle: tr(T.emptyTitle),
            emptyDescription: tr(T.emptyDesc),
            emptyFilteredTitle: g.emptyFilteredTitle,
            emptyFilteredDescription: g.emptyFilteredDescription,
            selectRow: g.selectRow,
            selectAll: g.selectAll,
          }}
        />
        {result ? (
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
            page={result.page}
            pageSize={result.pageSize}
            totalItems={result.total}
            totalPages={Math.max(1, Math.ceil(result.total / result.pageSize))}
            onPageChange={grid.setPage}
            onPageSizeChange={grid.setPageSize}
          />
        ) : null}
      </SurfaceCard>
    </div>
  );
}
