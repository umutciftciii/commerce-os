"use client";

/**
 * TODO-166 (ADR-265) — Sluglar ekranı. Ürün/kategori/marka güncel slug + geçmiş projeksiyonu,
 * ortak Admin Data Grid (ADR-089) üzerinde. Arama/filtre/sıralama/sayfalama SUNUCUDA. Salt-okuma;
 * slug değişimi kendi entity ekranından yapılır (buradan yalnız izleme + geçmiş + yönlendirme takibi).
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  PageHeader,
  SkeletonRows,
  Modal,
  useLocale,
} from "../../../../components/ui";
import {
  DataGrid,
  DataGridPagination,
  DataGridToolbar,
  useDataGridQuery,
  type DataGridColumn,
} from "../../../../components/data-grid";
import { format, getDictionary } from "@commerce-os/i18n";
import type { AdminListPagination, AdminSlugRecord, AdminSlugDetail } from "@commerce-os/api-client";
import { SeoIcon } from "../../../../components/icons";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";
import { SurfaceCard } from "../../../components/premium";
import { seoDict } from "../labels";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const ENTITY_TONES: Record<string, Tone> = {
  PRODUCT: "info",
  CATEGORY: "success",
  BRAND: "warning",
};

/** Entity'nin store-admin ekranı (ürün: detay; kategori/marka: liste). */
function entityHref(entityType: string, entityId: string): string {
  if (entityType === "PRODUCT") return `/products/${entityId}`;
  if (entityType === "BRAND") return "/brands";
  return "/categories";
}

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AdminSlugRecord[]; pagination: AdminListPagination };

type SlugFilters = { entityType: string; status: string; hasRedirects: string };

export default function SlugsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <SlugsView />
    </Suspense>
  );
}

function SlugsView() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;
  const t = seoDict(locale).slugs;

  const grid = useDataGridQuery<SlugFilters>({
    basePath: "/seo/slugs",
    sortOptions: ["updatedAt", "slug", "name"],
    defaultSortBy: "updatedAt",
    defaultSortOrder: "desc",
    filterKeys: ["entityType", "status", "hasRedirects"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [detail, setDetail] = useState<{ entityType: string; entityId: string } | null>(null);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listSlugs(requestQuery);
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

  const columns: DataGridColumn<AdminSlugRecord>[] = [
    {
      key: "slug",
      sortable: true,
      header: t.table.slug,
      className: "max-w-[16rem]",
      cell: (r) => (
        <code className="block truncate font-mono text-[12px] text-white/85" title={r.slug}>
          {r.slug}
        </code>
      ),
    },
    {
      key: "name",
      sortable: true,
      header: t.table.name,
      className: "max-w-[16rem]",
      cell: (r) => (
        <span className="block truncate text-white/85" title={r.name}>
          {r.name}
        </span>
      ),
    },
    {
      key: "entityType",
      header: t.table.entityType,
      className: "whitespace-nowrap",
      cell: (r) => (
        <Badge tone={ENTITY_TONES[r.entityType] ?? "neutral"}>
          {t.entityLabels[r.entityType as keyof typeof t.entityLabels] ?? r.entityType}
        </Badge>
      ),
    },
    {
      key: "canonical",
      header: t.table.canonical,
      className: "max-w-[16rem]",
      cell: (r) => (
        <code className="block truncate font-mono text-[12px] text-white/45" title={r.canonicalUrl}>
          {r.canonicalUrl}
        </code>
      ),
    },
    {
      key: "status",
      header: t.table.status,
      className: "whitespace-nowrap",
      cell: (r) => (
        <Badge tone={r.status === "ARCHIVED" ? "warning" : "success"}>
          {r.status === "ARCHIVED" ? t.statusLabels.archived : t.statusLabels.active}
        </Badge>
      ),
    },
    {
      key: "previous",
      header: t.table.previous,
      className: "whitespace-nowrap",
      cell: (r) => (
        <Badge tone={r.previousSlugCount > 0 ? "info" : "neutral"}>
          {format(t.previousCount, { count: r.previousSlugCount })}
        </Badge>
      ),
    },
    {
      key: "updated",
      sortable: true,
      header: t.table.updated,
      className: "whitespace-nowrap",
      cell: (r) => <span className="text-white/45">{formatDate(r.updatedAt)}</span>,
    },
    {
      key: "action",
      header: t.table.action,
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => (
        <button
          type="button"
          onClick={() => setDetail({ entityType: r.entityType, entityId: r.entityId })}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-white/10 px-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white"
        >
          {t.viewDetail}
        </button>
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

      {detail ? (
        <SlugDetailModal
          entityType={detail.entityType}
          entityId={detail.entityId}
          onClose={() => setDetail(null)}
        />
      ) : null}

      <SurfaceCard
        title={t.cardTitle}
        description={pagination ? format(t.countLabel, { count: pagination.totalItems }) : t.cardDescription}
        icon={<SeoIcon />}
      >
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
              key: "entityType",
              label: t.filters.entityType,
              options: (["PRODUCT", "CATEGORY", "BRAND"] as const).map((value) => ({
                value,
                label: t.entityLabels[value],
              })),
            },
            {
              kind: "select",
              key: "status",
              label: t.filters.status,
              options: [
                { value: "active", label: t.statusLabels.active },
                { value: "archived", label: t.statusLabels.archived },
              ],
            },
            {
              kind: "select",
              key: "hasRedirects",
              label: t.filters.hasRedirects,
              options: [
                { value: "true", label: t.hasRedirectsLabels.true },
                { value: "false", label: t.hasRedirectsLabels.false },
              ],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<SlugFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "updatedAt:desc", label: t.sort.newest },
            { value: "updatedAt:asc", label: t.sort.oldest },
            { value: "slug:asc", label: t.sort.slugAsc },
            { value: "name:asc", label: t.sort.nameAsc },
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
          rowKey={(r) => `${r.entityType}:${r.entityId}`}
          status={state.status}
          errorMessage={state.status === "error" ? state.message : undefined}
          onRetry={() => void load()}
          filtered={grid.activeFilterCount > 0}
          caption={t.cardTitle}
          sortBy={grid.sortBy}
          sortOrder={grid.sortOrder}
          onSortChange={(sortBy, sortOrder) => grid.setSort(sortBy, sortOrder)}
          emptyIcon={<SeoIcon />}
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

/* ── Slug detayı (geçmiş + entity ekranına git) ───────────────────────────── */
function SlugDetailModal({
  entityType,
  entityId,
  onClose,
}: {
  entityType: string;
  entityId: string;
  onClose: () => void;
}) {
  const locale = useLocale();
  const t = seoDict(locale).slugs;
  const d = t.detail;
  const c = getDictionary(locale).common;

  const [detail, setDetail] = useState<AdminSlugDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    storeApi
      .getSlug(entityType, entityId)
      .then((res) => {
        if (active) setDetail(res.data);
      })
      .catch((err) => {
        if (active) setError(messageForError(err, locale));
      });
    return () => {
      active = false;
    };
  }, [entityType, entityId, locale]);

  return (
    <Modal
      open
      onClose={onClose}
      title={d.title}
      closeLabel={c.actions.dismiss}
      footer={
        detail ? (
          <Link
            href={entityHref(detail.entityType, detail.entityId)}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-500/90 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-500"
          >
            {d.openEntity}
          </Link>
        ) : null
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!detail ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="space-y-4 text-sm">
          <dl className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-white/35">{d.currentSlug}</dt>
              <dd className="font-mono text-white/85">{detail.slug}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-white/35">{d.canonical}</dt>
              <dd className="truncate font-mono text-[12px] text-white/70" title={detail.canonicalUrl}>
                {detail.canonicalUrl}
              </dd>
            </div>
          </dl>

          <div>
            <p className="mb-1.5 text-xs uppercase tracking-wide text-white/35">{d.history}</p>
            {detail.history.length === 0 ? (
              <p className="text-white/45">{d.historyEmpty}</p>
            ) : (
              <ul className="space-y-2">
                {detail.history.map((h) => (
                  <li
                    key={h.oldSlug}
                    className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5"
                  >
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-[12px] text-white/80">{h.oldSlug}</code>
                      <span className="text-xs text-white/30">{d.redirectsTo}</span>
                      <code className="truncate font-mono text-[12px] text-emerald-300/70">
                        {detail.slug}
                      </code>
                    </div>
                    <p className="mt-1 text-xs text-white/35">
                      {d.changedAt}: {formatDate(h.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
