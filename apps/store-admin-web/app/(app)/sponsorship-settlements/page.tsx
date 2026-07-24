"use client";

/**
 * TODO-161A — Tüm mutabakatlar (settlement) tek listede. DRAFT kesinleştirilebilir; FINALIZED
 * immutable ve tahakkuk üretebilir. Metrikler dönem kapanışında snapshot'tır (ADR-123).
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
import type { AdminListPagination, SponsorshipSettlement } from "@commerce-os/api-client";
import { CampaignIcon } from "../../../components/icons";
import { storeApi, UiError } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import { PRICING_MODEL_LABELS, SETTLEMENT_STATUS_LABELS, sponsorshipError, type Locale } from "../sponsors/labels";

function errorText(error: unknown, locale: Locale): string {
  if (error instanceof UiError) return sponsorshipError(error.code) ?? messageForError(error, locale);
  return messageForError(error, locale);
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: SponsorshipSettlement[]; pagination: AdminListPagination };

export default function SettlementsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <SettlementsView />
    </Suspense>
  );
}

function SettlementsView() {
  const locale = useLocale() as Locale;
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;

  const grid = useDataGridQuery<{ status: string }>({
    basePath: "/sponsorship-settlements",
    sortOptions: ["createdAt", "periodStart", "status"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["status"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [actionError, setActionError] = useState<string | null>(null);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(() => JSON.parse(requestKey) as Record<string, string | number>, [requestKey]);

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listSponsorshipSettlements(requestQuery);
      setState({ status: "ready", rows: result.data, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: errorText(error, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  async function finalize(id: string) {
    setActionError(null);
    try {
      await storeApi.finalizeSponsorshipSettlement(id);
      void load();
    } catch (e) {
      setActionError(errorText(e, locale));
    }
  }
  async function charge(id: string) {
    setActionError(null);
    try {
      await storeApi.createSponsorshipCharge(id, { issue: true });
      void load();
    } catch (e) {
      setActionError(errorText(e, locale));
    }
  }

  const rows = state.status === "ready" ? state.rows : [];
  const pagination = state.status === "ready" ? state.pagination : null;

  const columns: DataGridColumn<SponsorshipSettlement>[] = [
    {
      key: "agreement",
      header: "Anlaşma",
      cell: (r) => (
        <Link href={`/sponsorship-agreements/${r.agreementId}`} className="font-medium text-white/90 hover:text-indigo-200 hover:underline">
          {r.agreementNumber}
          <span className="block text-xs font-normal text-white/40">{r.sponsorCompanyName}</span>
        </Link>
      ),
    },
    { key: "period", header: "Dönem", cell: (r) => <span className="text-xs text-white/60">{formatDate(r.periodStart)}–{formatDate(r.periodEnd)}</span> },
    { key: "pricingModel", header: "Model", cell: (r) => <span className="text-white/60">{PRICING_MODEL_LABELS[r.pricingModel]}</span> },
    { key: "calculatedChargeMinor", header: "Bedel", align: "right", cell: (r) => <span className="tabular-nums text-white/80">{formatMinor(r.calculatedChargeMinor, r.currency)}</span> },
    { key: "status", header: "Durum", cell: (r) => <Badge tone={r.status === "FINALIZED" ? "info" : "neutral"}>{SETTLEMENT_STATUS_LABELS[r.status]}</Badge> },
    {
      key: "actions",
      header: "İşlem",
      cell: (r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.status === "DRAFT" ? <Button variant="secondary" size="sm" onClick={() => void finalize(r.id)}>Kesinleştir</Button> : null}
          {r.status === "FINALIZED" && !r.chargeId ? <Button variant="secondary" size="sm" onClick={() => void charge(r.id)}>Tahakkuk</Button> : null}
          {r.chargeId ? <Link href="/sponsorship-payments" className="text-xs text-indigo-300 hover:underline">Tahakkuk →</Link> : null}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-white/90">Mutabakatlar</h1>
        <p className="text-sm text-white/50">Dönemsel metrik snapshot'ları ve tahakkuk üretimi.</p>
      </div>
      {actionError ? <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">{actionError}</div> : null}

      <SurfaceCard title="Dönem mutabakatları" description="DRAFT yeniden hesaplanabilir · FINALIZED immutable" icon={<CampaignIcon />}>
        <DataGridToolbar
          labels={{
            searchPlaceholder: "Anlaşma / sponsor ara",
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
              options: [
                { value: "DRAFT", label: "Taslak" },
                { value: "FINALIZED", label: "Kesinleşti" },
              ],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<{ status: string }>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "createdAt:desc", label: "En yeni" },
            { value: "periodStart:desc", label: "Döneme göre" },
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
          caption="Mutabakatlar"
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<CampaignIcon />}
          labels={{
            loading: g.loading,
            errorTitle: "Mutabakatlar yüklenemedi",
            retry: c.actions.retry,
            emptyTitle: "Henüz mutabakat yok",
            emptyDescription: "Bir anlaşma detayından dönem hesaplayın.",
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
