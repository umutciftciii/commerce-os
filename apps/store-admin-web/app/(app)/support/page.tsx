"use client";

/**
 * TODO-177 (ADR-289) Faz E — Store Admin Ürün Desteği inbox'ı (ADR-089 Admin Data Grid).
 * Arama/filtre/sayfalama SUNUCUDA. SLA rozetleri YALNIZ live cycle'dan (TD-177-2). Ham enum
 * gösterilmez (ticket-labels). Sayfa metinleri yerel (recovery/order-experience deseni; paylaşılan
 * i18n'e dokunulmaz), yalnız ortak Data Grid sözlüğü kullanılır.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, PageHeader, SkeletonRows, useLocale } from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../components/data-grid";
import { getDictionary } from "@commerce-os/i18n";
import type { AdminSupportTicketListResponse, AssignableUser } from "@commerce-os/api-client";
import { ReviewIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";
import {
  slaStateBadge,
  supportStatusKeys,
  supportStatusLabel,
  supportStatusTone,
  supportTopicKeys,
  supportTopicLabel,
} from "../../../lib/client/ticket-labels";

type Ticket = AdminSupportTicketListResponse["items"][number];
type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; result: AdminSupportTicketListResponse };
type SupportFilters = { status: string; assignee: string; topic: string; slaRisk: string };

export default function SupportInboxPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <SupportInboxView />
    </Suspense>
  );
}

function SupportInboxView() {
  const locale = useLocale();
  const tr = locale === "tr";
  const g = getDictionary(locale).storeAdmin.dataGrid;

  const grid = useDataGridQuery<SupportFilters>({
    basePath: "/support",
    sortOptions: ["lastActivityAt"],
    defaultSortBy: "lastActivityAt",
    defaultSortOrder: "desc",
    filterKeys: ["status", "assignee", "topic", "slaRisk"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [assignees, setAssignees] = useState<AssignableUser[]>([]);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listSupportTickets(requestQuery);
      setState({ status: "ready", result });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // "Atanan kişi" filtresi için store'un yetkili kullanıcıları (fail-open: hata → boş).
    storeApi.listSupportAssignableUsers().then(setAssignees).catch(() => setAssignees([]));
  }, []);

  const result = state.status === "ready" ? state.result : null;
  const rows: Ticket[] = result?.items ?? [];
  const total = result?.total ?? 0;
  const pageSize = result?.pageSize ?? 20;
  const page = result?.page ?? 1;

  const columns: DataGridColumn<Ticket>[] = [
    {
      key: "ticketNumber",
      header: tr ? "Talep" : "Request",
      className: "whitespace-nowrap",
      cell: (t) => <span className="font-medium tabular-nums text-white/90">{t.ticketNumber}</span>,
    },
    {
      key: "customer",
      header: tr ? "Müşteri" : "Customer",
      className: "max-w-[16rem]",
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate text-white/80" title={t.customerName ?? undefined}>
            {t.customerName ?? t.customerEmail}
          </p>
          <p className="truncate text-xs text-white/30">{t.customerEmail}</p>
        </div>
      ),
    },
    {
      key: "product",
      header: tr ? "Ürün" : "Product",
      className: "max-w-[14rem]",
      cell: (t) => (
        <span className="block truncate text-white/60" title={t.productTitle}>
          {t.productTitle}
        </span>
      ),
    },
    {
      key: "order",
      header: tr ? "Sipariş" : "Order",
      className: "whitespace-nowrap",
      cell: (t) => <span className="text-white/45">{t.orderNumber}</span>,
    },
    {
      key: "topic",
      header: tr ? "Konu" : "Topic",
      className: "whitespace-nowrap",
      cell: (t) => <span className="text-white/60">{supportTopicLabel(t.topic, tr)}</span>,
    },
    {
      key: "status",
      header: tr ? "Durum" : "Status",
      className: "whitespace-nowrap",
      cell: (t) => <Badge tone={supportStatusTone(t.status)}>{supportStatusLabel(t.status, tr)}</Badge>,
    },
    {
      key: "assignee",
      header: tr ? "Atanan" : "Assignee",
      className: "whitespace-nowrap",
      cell: (t) =>
        t.assigneeName ? (
          <span className="text-white/70">{t.assigneeName}</span>
        ) : (
          <span className="text-white/30">{tr ? "Atanmadı" : "Unassigned"}</span>
        ),
    },
    {
      key: "firstResponse",
      header: tr ? "İlk yanıt" : "First response",
      className: "whitespace-nowrap",
      cell: (t) => {
        const b = slaStateBadge(t.firstResponseState, tr);
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
    {
      key: "resolution",
      header: tr ? "Çözüm" : "Resolution",
      className: "whitespace-nowrap",
      cell: (t) => {
        const b = slaStateBadge(t.resolutionState, tr);
        return <Badge tone={b.tone}>{b.label}</Badge>;
      },
    },
    {
      key: "lastActivity",
      header: tr ? "Son işlem" : "Last activity",
      className: "whitespace-nowrap",
      cell: (t) => <span className="text-white/45">{formatDate(t.lastActivityAt)}</span>,
    },
    {
      key: "action",
      header: tr ? "İşlem" : "Action",
      align: "right",
      className: "whitespace-nowrap",
      cell: (t) => (
        <Link
          href={`/support/${t.ticketId}`}
          data-testid="ticket-row-link"
          className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {tr ? "Aç" : "Open"}
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={tr ? "Destek" : "Support"}
        title={tr ? "Ürün Desteği" : "Product Support"}
        description={
          tr
            ? "Müşteri destek taleplerini yanıtlayın, atayın ve durumunu yönetin."
            : "Reply to, assign and manage customer support requests."
        }
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            {tr ? "Yenile" : "Refresh"}
          </Button>
        }
      />

      <SurfaceCard
        title={tr ? "Destek talepleri" : "Support requests"}
        description={
          result ? `${total} ${tr ? "talep" : "requests"}` : tr ? "Yükleniyor…" : "Loading…"
        }
        icon={<ReviewIcon />}
      >
        <DataGridToolbar
          labels={{
            searchPlaceholder: tr ? "Talep no, müşteri veya ürün" : "Request no, customer or product",
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
              label: tr ? "Durum" : "Status",
              options: supportStatusKeys.map((value) => ({ value, label: supportStatusLabel(value, tr) })),
            },
            {
              kind: "select",
              key: "topic",
              label: tr ? "Konu" : "Topic",
              options: supportTopicKeys.map((value) => ({ value, label: supportTopicLabel(value, tr) })),
            },
            {
              kind: "select",
              key: "assignee",
              label: tr ? "Atanan" : "Assignee",
              options: assignees.map((u) => ({ value: u.id, label: u.name })),
            },
            {
              kind: "select",
              key: "slaRisk",
              label: "SLA",
              options: [{ value: "true", label: tr ? "Yalnız riskli" : "At risk only" }],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<SupportFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[{ value: "lastActivityAt:desc", label: tr ? "En son işlem" : "Latest activity" }]}
          sortValue={`${grid.sortBy}:${grid.sortOrder}`}
          onSortChange={(value) => {
            const [sortBy, sortOrder] = value.split(":");
            grid.setSort(sortBy, sortOrder === "asc" ? "asc" : "desc");
          }}
        />

        <DataGrid
          columns={columns}
          rows={rows}
          rowKey={(t) => t.ticketId}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption={tr ? "Destek talepleri" : "Support requests"}
          emptyIcon={<ReviewIcon />}
          labels={{
            loading: g.loading,
            errorTitle: tr ? "Talepler yüklenemedi" : "Failed to load requests",
            retry: tr ? "Tekrar dene" : "Retry",
            emptyTitle: tr ? "Henüz destek talebi yok" : "No support requests yet",
            emptyDescription: tr
              ? "Müşteriler ürünleriyle ilgili destek talebi oluşturduğunda burada görünür."
              : "Requests appear here when customers open product support.",
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
            page={page}
            pageSize={pageSize}
            totalItems={total}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
            onPageChange={grid.setPage}
            onPageSizeChange={grid.setPageSize}
          />
        ) : null}
      </SurfaceCard>
    </>
  );
}
