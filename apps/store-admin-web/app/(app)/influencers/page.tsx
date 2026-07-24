"use client";

/**
 * TODO-160 — Influencer izleme & atıf. Üstte tarih aralıklı atıf panosu (KPI şeridi
 * + CSV indir), altta influencer Data Grid'i (arama + durum filtresi). Satır adı
 * detay sayfasına götürür. "Yeni influencer" modalı kod çakışmasında (409 CODE_TAKEN)
 * alan-içi hata gösterir. Para minor birimdedir (100'e bölünür); oran 0..1 → yüzde.
 */

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
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
} from "../../../components/data-grid";
import { getDictionary } from "@commerce-os/i18n";
import type {
  AdminListPagination,
  InfluencerSummary,
  InfluencerStatus,
  AttributionKpiSummary,
} from "@commerce-os/api-client";
import { InfluencerIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import { InfluencerFormModal } from "./influencer-form";
import {
  AttributionMetrics,
  isoDaysAgo,
  isoToday,
  type AttributionLabels,
} from "./attribution";

type Locale = "tr" | "en";
type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const STATUS_TONES: Record<InfluencerStatus, Tone> = { ACTIVE: "success", INACTIVE: "neutral" };

const L = {
  tr: {
    eyebrow: "Satış",
    title: "Influencer'lar",
    description:
      "Influencer, kampanya ve izleme linklerini yönetin; tıklama/atıf performansını izleyin. Atıf sunucu tarafında hesaplanır.",
    add: "Yeni influencer",
    cardTitle: "Influencer dizini",
    cardDescription: "Arama ve durum filtresiyle tüm influencer'lar.",
    dashTitle: "Atıf panosu",
    dashDescription: "Seçili tarih aralığında toplam tıklama, dönüşüm ve ciro.",
    dateFrom: "Başlangıç",
    dateTo: "Bitiş",
    csv: "CSV indir",
    csvBusy: "Hazırlanıyor…",
    loadError: "Influencer'lar yüklenemedi.",
    emptyTitle: "Henüz influencer yok",
    emptyDescription: "İlk influencer'ı ekleyerek atıf takibine başlayın.",
    colName: "Ad",
    colCode: "Kod",
    colStatus: "Durum",
    colCampaigns: "Kampanya",
    colCreated: "Oluşturma",
    searchPlaceholder: "İsim veya kod ara…",
    filterStatus: "Durum",
    sortNewest: "En yeni",
    sortOldest: "En eski",
    sortName: "İsim (A-Z)",
    statusLabels: { ACTIVE: "Aktif", INACTIVE: "Pasif" } as Record<InfluencerStatus, string>,
    metrics: {
      totalClicks: "Toplam tıklama",
      uniqueVisitors: "Tekil ziyaretçi",
      attributedOrders: "Atıflı sipariş",
      conversionRate: "Dönüşüm oranı",
      grossRevenue: "Brüt ciro",
      netRevenue: "Net ciro",
    } satisfies AttributionLabels,
  },
  en: {
    eyebrow: "Sales",
    title: "Influencers",
    description:
      "Manage influencers, campaigns and tracking links; monitor click/attribution performance. Attribution is computed server-side.",
    add: "New influencer",
    cardTitle: "Influencer directory",
    cardDescription: "All influencers with search and status filter.",
    dashTitle: "Attribution dashboard",
    dashDescription: "Total clicks, conversion and revenue in the selected date range.",
    dateFrom: "From",
    dateTo: "To",
    csv: "Download CSV",
    csvBusy: "Preparing…",
    loadError: "Could not load influencers.",
    emptyTitle: "No influencers yet",
    emptyDescription: "Add your first influencer to start attribution tracking.",
    colName: "Name",
    colCode: "Code",
    colStatus: "Status",
    colCampaigns: "Campaigns",
    colCreated: "Created",
    searchPlaceholder: "Search name or code…",
    filterStatus: "Status",
    sortNewest: "Newest",
    sortOldest: "Oldest",
    sortName: "Name (A-Z)",
    statusLabels: { ACTIVE: "Active", INACTIVE: "Inactive" } as Record<InfluencerStatus, string>,
    metrics: {
      totalClicks: "Total clicks",
      uniqueVisitors: "Unique visitors",
      attributedOrders: "Attributed orders",
      conversionRate: "Conversion rate",
      grossRevenue: "Gross revenue",
      netRevenue: "Net revenue",
    } satisfies AttributionLabels,
  },
} satisfies Record<Locale, unknown>;

type InfluencerFilters = { status: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: InfluencerSummary[]; pagination: AdminListPagination };

export default function InfluencersPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <InfluencersView />
    </Suspense>
  );
}

function InfluencersView() {
  const locale = useLocale() as Locale;
  const t = L[locale] ?? L.tr;
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;

  const grid = useDataGridQuery<InfluencerFilters>({
    basePath: "/influencers",
    sortOptions: ["createdAt", "name", "status"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["status"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [formOpen, setFormOpen] = useState(false);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listInfluencers(requestQuery);
      setState({ status: "ready", rows: result.data, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.status === "ready" ? state.rows : [];
  const pagination = state.status === "ready" ? state.pagination : null;

  const columns: DataGridColumn<InfluencerSummary>[] = [
    {
      key: "name",
      sortable: true,
      header: t.colName,
      cell: (r) => (
        <Link
          href={`/influencers/${r.id}`}
          className="font-medium text-white/90 underline-offset-2 hover:text-indigo-200 hover:underline"
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: "code",
      header: t.colCode,
      cell: (r) => <span className="font-mono text-white/70">{r.code}</span>,
    },
    {
      key: "status",
      sortable: true,
      header: t.colStatus,
      cell: (r) => <Badge tone={STATUS_TONES[r.status]}>{t.statusLabels[r.status]}</Badge>,
    },
    {
      key: "campaignCount",
      header: t.colCampaigns,
      align: "right",
      cell: (r) => <span className="tabular-nums text-white/70">{r.campaignCount}</span>,
    },
    {
      key: "createdAt",
      sortable: true,
      header: t.colCreated,
      cell: (r) => <span className="text-white/50">{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button onClick={() => setFormOpen(true)}>{t.add}</Button>}
      />

      {formOpen ? (
        <InfluencerFormModal
          editing={null}
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            void load();
          }}
        />
      ) : null}

      <AttributionDashboard t={t} locale={locale} />

      <SurfaceCard title={t.cardTitle} description={t.cardDescription} icon={<InfluencerIcon />}>
        <DataGridToolbar
          labels={{
            searchPlaceholder: t.searchPlaceholder,
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
              label: t.filterStatus,
              options: (["ACTIVE", "INACTIVE"] as InfluencerStatus[]).map((value) => ({
                value,
                label: t.statusLabels[value],
              })),
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<InfluencerFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "createdAt:desc", label: t.sortNewest },
            { value: "createdAt:asc", label: t.sortOldest },
            { value: "name:asc", label: t.sortName },
          ]}
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
          caption={t.cardTitle}
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<InfluencerIcon />}
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
    </div>
  );
}

/* ── Atıf panosu (tarih aralığı + KPI şeridi + CSV) ─────────────────────────── */
function AttributionDashboard({ t, locale }: { t: (typeof L)[Locale]; locale: Locale }) {
  const [dateFrom, setDateFrom] = useState(() => isoDaysAgo(30));
  const [dateTo, setDateTo] = useState(() => isoToday());
  const [summary, setSummary] = useState<AttributionKpiSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [csvBusy, setCsvBusy] = useState(false);

  const query = useMemo(() => ({ dateFrom, dateTo }), [dateFrom, dateTo]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await storeApi.getInfluencerAnalytics(query);
      setSummary(result.data.summary);
    } catch (cause) {
      setError(messageForError(cause, locale));
    }
  }, [query, locale]);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadCsv = async () => {
    setCsvBusy(true);
    setError(null);
    try {
      const csv = await storeApi.exportInfluencerAnalytics(query);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `influencer-attribution-${dateFrom}_${dateTo}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (cause) {
      setError(messageForError(cause, locale));
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <SurfaceCard
      title={t.dashTitle}
      description={t.dashDescription}
      actions={
        <div className="flex flex-wrap items-end gap-2">
          <Input
            label={t.dateFrom}
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
          <Input
            label={t.dateTo}
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
          <Button variant="secondary" onClick={() => void downloadCsv()} disabled={csvBusy}>
            {csvBusy ? t.csvBusy : t.csv}
          </Button>
        </div>
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {summary ? (
        <AttributionMetrics summary={summary} labels={t.metrics} locale={locale} />
      ) : (
        <SkeletonRows rows={2} />
      )}
    </SurfaceCard>
  );
}
