"use client";

/**
 * TODO-159E (ADR-094) — Ürün yorumu moderasyon ekranı.
 * Ortak Admin Data Grid (arama + durum/puan/doğrulanmış filtresi + sıralama + sayfalama,
 * hepsi SUNUCUDA). Satır aksiyonu bir Modal açar: tam yorum + approve/reject/hide + not.
 * Yeni tablo altyapısı YOK; mevcut kit + AuditLog (gateway) yeniden kullanılır.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Modal,
  PageHeader,
  SkeletonRows,
  Textarea,
  useLocale,
} from "../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../components/data-grid";
import { format, getDictionary } from "@commerce-os/i18n";
import type {
  AdminListPagination,
  AdminReviewSummary,
  AdminReviewDetail,
  ProductReviewStatus,
  ReviewModerationAction,
} from "@commerce-os/api-client";
import { ReviewIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const STATUS_TONES: Record<ProductReviewStatus, Tone> = {
  PENDING: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  HIDDEN: "neutral",
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; reviews: AdminReviewSummary[]; pagination: AdminListPagination };

type ReviewFilters = { status: string; rating: string; verifiedPurchase: string };

function Stars({ rating }: { rating: number }) {
  return (
    <span aria-hidden className="tracking-tight text-amber-300/90">
      {"★".repeat(rating)}
      <span className="text-white/20">{"★".repeat(5 - rating)}</span>
    </span>
  );
}

export default function ReviewsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <ReviewsView />
    </Suspense>
  );
}

function ReviewsView() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.reviews;
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;
  const statusLabels = t.statusLabels as Record<ProductReviewStatus, string>;

  const grid = useDataGridQuery<ReviewFilters>({
    basePath: "/reviews",
    sortOptions: ["createdAt", "rating", "status", "helpfulCount"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["status", "rating", "verifiedPurchase"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [activeId, setActiveId] = useState<string | null>(null);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listReviews(requestQuery);
      setState({ status: "ready", reviews: result.data, pagination: result.pagination });
    } catch (error) {
      setState({ status: "error", message: messageForError(error, locale) });
    }
  }, [locale, requestQuery]);

  useEffect(() => {
    void load();
  }, [load]);

  const reviews = state.status === "ready" ? state.reviews : [];
  const pagination = state.status === "ready" ? state.pagination : null;

  const columns: DataGridColumn<AdminReviewSummary>[] = [
    {
      key: "product",
      header: t.table.product,
      className: "max-w-[16rem]",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-white/90" title={r.productTitle}>
            {r.productTitle}
          </p>
          {r.title ? <p className="truncate text-xs text-white/50">{r.title}</p> : null}
        </div>
      ),
    },
    {
      key: "customer",
      header: t.table.customer,
      cell: (r) => <span className="text-white/70">{r.customerName}</span>,
    },
    {
      key: "rating",
      sortable: true,
      header: t.table.rating,
      cell: (r) => <Stars rating={r.rating} />,
    },
    {
      key: "review",
      header: t.table.review,
      className: "max-w-[22rem]",
      cell: (r) => (
        <p className="truncate text-white/60" title={r.bodyPreview}>
          {r.bodyPreview}
        </p>
      ),
    },
    {
      key: "verified",
      header: t.table.verified,
      cell: (r) =>
        r.verifiedPurchase ? (
          <Badge tone="info">{t.verifiedYes}</Badge>
        ) : (
          <span className="text-white/40">{t.verifiedNo}</span>
        ),
    },
    {
      key: "helpfulCount",
      sortable: true,
      header: t.table.helpful,
      align: "right",
      cell: (r) => <span className="tabular-nums text-white/70">{r.helpfulCount}</span>,
    },
    {
      key: "status",
      sortable: true,
      header: t.table.status,
      cell: (r) => <Badge tone={STATUS_TONES[r.status]}>{statusLabels[r.status]}</Badge>,
    },
    {
      key: "createdAt",
      sortable: true,
      header: t.table.created,
      cell: (r) => <span className="text-white/50">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      cell: (r) => (
        <Button variant="secondary" onClick={() => setActiveId(r.id)}>
          {t.manageAction}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <Button variant="secondary" onClick={() => void load()}>
            {c.actions.refresh}
          </Button>
        }
      />

      {activeId ? (
        <ReviewDrawer
          reviewId={activeId}
          onClose={() => setActiveId(null)}
          onModerated={() => {
            setActiveId(null);
            void load();
          }}
        />
      ) : null}

      <SurfaceCard title={t.cardTitle} description={t.cardDescription} icon={<ReviewIcon />}>
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
          filters={[
            {
              kind: "select",
              key: "status",
              label: t.grid.filters.status,
              options: (
                ["PENDING", "APPROVED", "REJECTED", "HIDDEN"] as ProductReviewStatus[]
              ).map((value) => ({ value, label: statusLabels[value] })),
            },
            {
              kind: "select",
              key: "rating",
              label: t.grid.filters.rating,
              options: [5, 4, 3, 2, 1].map((value) => ({
                value: String(value),
                label: format(t.ratingLabel, { rating: value }),
              })),
            },
            {
              kind: "select",
              key: "verifiedPurchase",
              label: t.grid.filters.verified,
              options: [
                { value: "true", label: t.verifiedYes },
                { value: "false", label: t.verifiedNo },
              ],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<ReviewFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "createdAt:desc", label: t.grid.sort.newest },
            { value: "createdAt:asc", label: t.grid.sort.oldest },
            { value: "rating:desc", label: t.grid.sort.ratingHigh },
            { value: "rating:asc", label: t.grid.sort.ratingLow },
            { value: "helpfulCount:desc", label: t.grid.sort.helpful },
          ]}
          sortValue={`${grid.sortBy}:${grid.sortOrder}`}
          onSortChange={(value) => {
            const [sortBy, sortOrder] = value.split(":");
            grid.setSort(sortBy, sortOrder === "asc" ? "asc" : "desc");
          }}
        />

        <DataGrid
          columns={columns}
          rows={reviews}
          rowKey={(r) => r.id}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption={t.cardTitle}
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<ReviewIcon />}
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
    </>
  );
}

/* ── Moderasyon drawer (Modal) ────────────────────────────────────────────── */
function ReviewDrawer({
  reviewId,
  onClose,
  onModerated,
}: {
  reviewId: string;
  onClose: () => void;
  onModerated: () => void;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const t = dict.storeAdmin.reviews;
  const d = t.drawer;
  const statusLabels = t.statusLabels as Record<ProductReviewStatus, string>;

  const [detail, setDetail] = useState<AdminReviewDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setLoadError(null);
    void (async () => {
      try {
        const result = await storeApi.getReview(reviewId);
        if (!alive) return;
        setDetail(result.data);
        setNote(result.data.moderationNote ?? "");
      } catch (error) {
        if (alive) setLoadError(messageForError(error, locale));
      }
    })();
    return () => {
      alive = false;
    };
  }, [reviewId, locale]);

  const moderate = async (action: ReviewModerationAction) => {
    setBusy(true);
    setActionError(null);
    try {
      await storeApi.moderateReview(reviewId, {
        action,
        moderationNote: note.trim() ? note.trim() : null,
      });
      onModerated();
    } catch (error) {
      setActionError(messageForError(error, locale));
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={d.title}
      closeLabel={d.close}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={() => void moderate("hide")} disabled={busy || !detail}>
            {d.hide}
          </Button>
          <Button variant="secondary" onClick={() => void moderate("reject")} disabled={busy || !detail}>
            {d.reject}
          </Button>
          <Button onClick={() => void moderate("approve")} disabled={busy || !detail}>
            {d.approve}
          </Button>
        </div>
      }
    >
      {loadError ? <Alert tone="error">{loadError}</Alert> : null}
      {actionError ? <Alert tone="error">{actionError}</Alert> : null}
      {!detail && !loadError ? <SkeletonRows rows={4} /> : null}
      {detail ? (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label={d.product} value={detail.productTitle} />
            <Field label={d.customer} value={detail.customerName} />
            <Field label={d.order} value={detail.orderNumber} />
            <Field
              label={d.status}
              value={
                <Badge tone={STATUS_TONES[detail.status]}>{statusLabels[detail.status]}</Badge>
              }
            />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-white/40">{d.rating}</p>
            <Stars rating={detail.rating} />
          </div>
          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-white/40">{d.body}</p>
            {detail.title ? <p className="font-medium text-white/90">{detail.title}</p> : null}
            <p className="whitespace-pre-wrap text-white/70">{detail.body}</p>
          </div>
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-white/40">
              {d.moderationNote}
            </label>
            <Textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={d.notePlaceholder}
            />
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wide text-white/40">{label}</p>
      <div className="text-white/80">{value}</div>
    </div>
  );
}
