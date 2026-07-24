"use client";

/**
 * TODO-161 — Sponsorlu Ürünler. Üstte tarih aralıklı performans panosu (KPI + CSV),
 * altta kampanya Data Grid'i (arama + durum + yerleşim filtresi). Satır adı detay/düzenleme
 * sayfasına götürür. "Yeni kampanya" /sponsored-products/new'e gider.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Badge, Button, PageHeader, SkeletonRows, useLocale } from "../../../components/ui";
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
  SponsoredCampaignSummary,
  SponsoredCampaignStatus,
  SponsoredPlacementType,
} from "@commerce-os/api-client";
import { CampaignIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import { sponsoredLabels, type Locale } from "./labels";
import { SponsoredDashboard } from "./dashboard";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";
const STATUS_TONES: Record<SponsoredCampaignStatus, Tone> = { ACTIVE: "success", PAUSED: "warning", ARCHIVED: "neutral" };

type SponsoredFilters = { status: string; placement: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: SponsoredCampaignSummary[]; pagination: AdminListPagination };

export default function SponsoredProductsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <SponsoredProductsView />
    </Suspense>
  );
}

function SponsoredProductsView() {
  const router = useRouter();
  const locale = useLocale() as Locale;
  const t = sponsoredLabels(locale);
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;

  const grid = useDataGridQuery<SponsoredFilters>({
    basePath: "/sponsored-products",
    sortOptions: ["createdAt", "name", "status", "priority"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["status", "placement"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(() => JSON.parse(requestKey) as Record<string, string | number>, [requestKey]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listSponsoredCampaigns(requestQuery);
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

  const columns: DataGridColumn<SponsoredCampaignSummary>[] = [
    {
      key: "name",
      sortable: true,
      header: t.colName,
      cell: (r) => (
        <Link
          href={`/sponsored-products/${r.id}`}
          className="font-medium text-white/90 underline-offset-2 hover:text-indigo-200 hover:underline"
        >
          {r.name}
        </Link>
      ),
    },
    {
      key: "placement",
      header: t.colPlacement,
      cell: (r) => <span className="text-white/70">{t.placementLabels[r.placement as SponsoredPlacementType]}</span>,
    },
    {
      key: "status",
      sortable: true,
      header: t.colStatus,
      cell: (r) => <Badge tone={STATUS_TONES[r.status]}>{t.statusLabels[r.status]}</Badge>,
    },
    {
      key: "isLive",
      header: t.colLive,
      cell: (r) => (
        <Badge tone={r.isLive ? "success" : "neutral"}>{r.isLive ? t.live : t.notLive}</Badge>
      ),
    },
    {
      key: "productCount",
      header: t.colProducts,
      align: "right",
      cell: (r) => <span className="tabular-nums text-white/70">{r.productCount}</span>,
    },
    {
      key: "priority",
      sortable: true,
      header: t.colPriority,
      align: "right",
      cell: (r) => <span className="tabular-nums text-white/50">{r.priority}</span>,
    },
    {
      key: "createdAt",
      header: t.dateFrom,
      cell: (r) => <span className="text-white/50">{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button onClick={() => router.push("/sponsored-products/new")}>{t.add}</Button>}
      />

      <SponsoredDashboard t={t} locale={locale} />

      <SurfaceCard title={t.cardTitle} description={t.cardDescription} icon={<CampaignIcon />}>
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
              options: (["ACTIVE", "PAUSED", "ARCHIVED"] as SponsoredCampaignStatus[]).map((value) => ({
                value,
                label: t.statusLabels[value],
              })),
            },
            {
              kind: "select",
              key: "placement",
              label: t.filterPlacement,
              options: (["HOME_SHOWCASE", "SEARCH_RESULTS"] as SponsoredPlacementType[]).map((value) => ({
                value,
                label: t.placementLabels[value],
              })),
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<SponsoredFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "createdAt:desc", label: t.sortNewest },
            { value: "createdAt:asc", label: t.sortOldest },
            { value: "name:asc", label: t.sortName },
            { value: "priority:desc", label: t.sortPriority },
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
          emptyIcon={<CampaignIcon />}
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
