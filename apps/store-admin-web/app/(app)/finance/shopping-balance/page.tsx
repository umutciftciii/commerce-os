"use client";

/**
 * Shopping Balance Admin (Müşteri Bakiye Yönetimi) — Finans > Alışveriş Bakiyesi.
 *
 * Mağazanın tüm müşteri alışveriş bakiyesi hesaplarının merkezî listesi + KPI özeti.
 * Arama (ad/e-posta), bakiye>0 / kaynak / yakında-dolacak filtreleri, sıralama ve
 * sayfalama SUNUCUDA (gateway projeksiyon otoritesi). Para minor→formatMinor. SALT-OKUNUR
 * liste; bakiye tanımlama müşteri detayında (goodwill grant altyapısı reuse).
 */
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Button,
  PageHeader,
  SkeletonRows,
  useLocale,
} from "../../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../../components/data-grid";
import { getDictionary, format } from "@commerce-os/i18n";
import type {
  AdminListPagination,
  ShoppingBalanceRowDto,
  ShoppingBalanceSummaryDto,
} from "@commerce-os/api-client";
import { PaymentIcon } from "../../../../components/icons";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate, formatMinor } from "../../../../lib/client/format";
import { SurfaceCard } from "../../../components/premium";

type Filters = { balancePositive: string; source: string; expiringWithinDays: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: ShoppingBalanceRowDto[]; summary: ShoppingBalanceSummaryDto; pagination: AdminListPagination };

const money = (minor: string, currency: string) => formatMinor(Number(minor), currency);
const dateOrDash = (iso: string | null) => (iso ? formatDate(iso) : "—");

export default function ShoppingBalancePage() {
  // useSearchParams (Data Grid URL state) Suspense sınırı ister.
  return (
    <Suspense fallback={<SkeletonRows rows={6} />}>
      <ShoppingBalanceView />
    </Suspense>
  );
}

function ShoppingBalanceView() {
  const locale = useLocale();
  const tr = locale === "tr";
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;

  const L = {
    eyebrow: tr ? "Finans" : "Finance",
    title: tr ? "Alışveriş Bakiyesi" : "Shopping Balance",
    description: tr
      ? "Müşteri alışveriş bakiyesi hesaplarını görüntüle, incele ve yönet."
      : "View, inspect and manage customer shopping-balance accounts.",
    cardTitle: tr ? "Müşteri Bakiyeleri" : "Customer Balances",
    countLabel: tr ? "{count} hesap" : "{count} accounts",
    searchPlaceholder: tr ? "Müşteri adı veya e-posta" : "Customer name or email",
    col: {
      customer: tr ? "Müşteri" : "Customer",
      available: tr ? "Kullanılabilir" : "Available",
      issued: tr ? "Toplam yüklenen" : "Total loaded",
      spent: tr ? "Harcanan" : "Spent",
      refundOrigin: tr ? "İade kaynaklı" : "Refund-origin",
      goodwill: tr ? "Goodwill" : "Goodwill",
      restored: tr ? "Restore" : "Restored",
      expired: tr ? "Süresi dolan" : "Expired",
      nearestExpiry: tr ? "En yakın son kul." : "Next expiry",
      lastMovement: tr ? "Son hareket" : "Last movement",
      action: tr ? "Detay" : "Detail",
    },
    kpi: {
      outstanding: tr ? "Toplam yükümlülük" : "Outstanding liability",
      customers: tr ? "Bakiyesi olan müşteri" : "Customers with balance",
      goodwill: tr ? "Goodwill bakiye" : "Goodwill balance",
      refundOrigin: tr ? "İade kaynaklı bakiye" : "Refund-origin balance",
      expiring: tr ? "Yakında dolacak" : "Expiring soon",
      expiringHint: (d: number) => (tr ? `${d} gün içinde` : `within ${d} days`),
    },
    manage: tr ? "İncele" : "Inspect",
    filters: {
      balancePositive: tr ? "Bakiye" : "Balance",
      balancePositiveTrue: tr ? "Bakiyesi > 0" : "Balance > 0",
      source: tr ? "Kaynak" : "Source",
      goodwill: tr ? "Goodwill / telafi" : "Goodwill",
      refundOrigin: tr ? "İade kaynaklı" : "Refund-origin",
      expiring: tr ? "Son kullanım" : "Expiry",
    },
    sort: {
      availableDesc: tr ? "Bakiye (çok→az)" : "Balance (high→low)",
      availableAsc: tr ? "Bakiye (az→çok)" : "Balance (low→high)",
      expirySoon: tr ? "Son kullanıma yakın" : "Expiring first",
      lastMoveDesc: tr ? "Son hareket (yeni)" : "Last movement (newest)",
      customerAsc: tr ? "Müşteri (A→Z)" : "Customer (A→Z)",
    },
  };

  const grid = useDataGridQuery<Filters>({
    basePath: "/finance/shopping-balance",
    sortOptions: ["available", "nearestExpiry", "lastMovement", "customer"],
    defaultSortBy: "available",
    defaultSortOrder: "desc",
    filterKeys: ["balancePositive", "source", "expiringWithinDays"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listShoppingBalances(requestQuery);
      setState({ status: "ready", rows: result.data, summary: result.summary, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = state.status === "ready" ? state.rows : [];
  const summary = state.status === "ready" ? state.summary : null;
  const pagination = state.status === "ready" ? state.pagination : null;

  const moneyCell = (value: string, currency: string, strong = false) => (
    <span className={`tabular-nums ${strong ? "font-medium text-white/90" : "text-white/55"}`}>
      {money(value, currency)}
    </span>
  );

  const columns: DataGridColumn<ShoppingBalanceRowDto>[] = [
    {
      key: "customer",
      sortable: true,
      header: L.col.customer,
      className: "max-w-[18rem]",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-white/90" title={r.customerName ?? undefined}>
            {r.customerName ?? (tr ? "İsimsiz" : "Unnamed")}
          </p>
          <p className="truncate text-xs text-white/30" title={r.customerEmail ?? undefined}>
            {r.customerEmail ?? "—"}
          </p>
        </div>
      ),
    },
    { key: "available", sortable: true, header: L.col.available, align: "right", className: "whitespace-nowrap", cell: (r) => moneyCell(r.availableMinor, r.currency, true) },
    { key: "issued", header: L.col.issued, align: "right", className: "whitespace-nowrap", cell: (r) => moneyCell(r.issuedMinor, r.currency) },
    { key: "spent", header: L.col.spent, align: "right", className: "whitespace-nowrap", cell: (r) => moneyCell(r.spentMinor, r.currency) },
    { key: "refundOrigin", header: L.col.refundOrigin, align: "right", className: "whitespace-nowrap", cell: (r) => moneyCell(r.refundOriginMinor, r.currency) },
    { key: "goodwill", header: L.col.goodwill, align: "right", className: "whitespace-nowrap", cell: (r) => moneyCell(r.goodwillMinor, r.currency) },
    { key: "restored", header: L.col.restored, align: "right", className: "whitespace-nowrap", cell: (r) => moneyCell(r.restoredMinor, r.currency) },
    { key: "expired", header: L.col.expired, align: "right", className: "whitespace-nowrap", cell: (r) => moneyCell(r.expiredMinor, r.currency) },
    {
      key: "nearestExpiry",
      sortable: true,
      header: L.col.nearestExpiry,
      className: "whitespace-nowrap",
      cell: (r) => <span className="text-white/45">{dateOrDash(r.nearestExpiryAt)}</span>,
    },
    {
      key: "lastMovement",
      sortable: true,
      header: L.col.lastMovement,
      className: "whitespace-nowrap",
      cell: (r) => <span className="text-white/45">{dateOrDash(r.lastMovementAt)}</span>,
    },
    {
      key: "action",
      header: L.col.action,
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => (
        <Link
          href={`/finance/shopping-balance/${r.customerId}`}
          data-testid="shopping-balance-row-link"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {L.manage}
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={L.eyebrow}
        title={L.title}
        description={L.description}
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            {c.actions.refresh}
          </Button>
        }
      />

      {/* KPI özeti — mağaza-geneli (filtreden bağımsız). */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <KpiCard testId="sb-kpi-outstanding" label={L.kpi.outstanding} value={summary ? money(summary.outstandingLiabilityMinor, summary.currency) : "—"} />
        <KpiCard testId="sb-kpi-customers" label={L.kpi.customers} value={summary ? String(summary.customersWithBalance) : "—"} />
        <KpiCard testId="sb-kpi-goodwill" label={L.kpi.goodwill} value={summary ? money(summary.goodwillBalanceMinor, summary.currency) : "—"} />
        <KpiCard testId="sb-kpi-refund" label={L.kpi.refundOrigin} value={summary ? money(summary.refundOriginBalanceMinor, summary.currency) : "—"} />
        <KpiCard
          testId="sb-kpi-expiring"
          label={L.kpi.expiring}
          hint={summary ? L.kpi.expiringHint(summary.expiringWithinDays) : undefined}
          value={summary ? money(summary.expiringSoonMinor, summary.currency) : "—"}
        />
      </div>

      <SurfaceCard
        title={L.cardTitle}
        description={pagination ? format(L.countLabel, { count: pagination.totalItems }) : undefined}
        icon={<PaymentIcon />}
      >
        <DataGridToolbar
          labels={{
            searchPlaceholder: L.searchPlaceholder,
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
              key: "balancePositive",
              label: L.filters.balancePositive,
              options: [{ value: "true", label: L.filters.balancePositiveTrue }],
            },
            {
              kind: "select",
              key: "source",
              label: L.filters.source,
              options: [
                { value: "GOODWILL", label: L.filters.goodwill },
                { value: "REFUND_ORIGIN", label: L.filters.refundOrigin },
              ],
            },
            {
              kind: "select",
              key: "expiringWithinDays",
              label: L.filters.expiring,
              options: [
                { value: "30", label: "30 " + (tr ? "gün" : "days") },
                { value: "60", label: "60 " + (tr ? "gün" : "days") },
                { value: "90", label: "90 " + (tr ? "gün" : "days") },
              ],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<Filters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "available:desc", label: L.sort.availableDesc },
            { value: "available:asc", label: L.sort.availableAsc },
            { value: "nearestExpiry:asc", label: L.sort.expirySoon },
            { value: "lastMovement:desc", label: L.sort.lastMoveDesc },
            { value: "customer:asc", label: L.sort.customerAsc },
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
          rowKey={(r) => r.customerId}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption={L.cardTitle}
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<PaymentIcon />}
          labels={{
            loading: g.loading,
            errorTitle: c.actions.retry,
            retry: c.actions.retry,
            emptyTitle: tr ? "Bakiye hesabı yok" : "No balance accounts",
            emptyDescription: tr ? "Bu mağazada henüz müşteri bakiyesi bulunmuyor." : "No customer balances in this store yet.",
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
    </>
  );
}

function KpiCard({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId?: string }) {
  return (
    <div data-testid={testId} className="rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
      <div className="text-xs text-white/40">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-white/90">{value}</div>
      {hint ? <div className="mt-0.5 text-[11px] text-white/30">{hint}</div> : null}
    </div>
  );
}
