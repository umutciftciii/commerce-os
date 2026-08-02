"use client";

/**
 * TODO-166 (ADR-265) — Yönlendirmeler ekranı. Otomatik (slug-değişimi) + manuel kurallar,
 * ortak Admin Data Grid (ADR-089) üzerinde. Arama/filtre/sıralama/sayfalama SUNUCUDA; manuel
 * redirect CRUD + otomatik/manuel silme-düzenleme güvenliği gateway'de zorlanır.
 */

import { Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Alert,
  Badge,
  Button,
  Input,
  Modal,
  PageHeader,
  Select,
  SkeletonRows,
  Textarea,
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
import type { AdminListPagination, AdminRedirect, AdminRedirectDetail } from "@commerce-os/api-client";
import { SeoIcon } from "../../../../components/icons";
import { storeApi } from "../../../../lib/client/api";
import { messageForError } from "../../../../lib/client/messages";
import { formatDate } from "../../../../lib/client/format";
import { SurfaceCard } from "../../../components/premium";
import { seoDict } from "../labels";

type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const REDIRECT_TYPES = ["PERMANENT_301", "FOUND_302", "TEMPORARY_307", "PERMANENT_308"] as const;
type RedirectTypeValue = (typeof REDIRECT_TYPES)[number];

const ENTITY_TONES: Record<string, Tone> = {
  PRODUCT: "info",
  CATEGORY: "success",
  BRAND: "warning",
  OTHER: "neutral",
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: AdminRedirect[]; pagination: AdminListPagination };

type RedirectFilters = { origin: string; type: string; entityType: string; enabled: string };

export default function RedirectsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <RedirectsView />
    </Suspense>
  );
}

function RedirectsView() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;
  const t = seoDict(locale).redirects;

  const grid = useDataGridQuery<RedirectFilters>({
    basePath: "/seo/redirects",
    sortOptions: ["createdAt", "updatedAt", "sourcePath"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["origin", "type", "entityType", "enabled"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listRedirects(requestQuery);
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

  const columns: DataGridColumn<AdminRedirect>[] = [
    {
      key: "sourcePath",
      sortable: true,
      header: t.table.source,
      className: "max-w-[18rem]",
      cell: (r) => (
        <code className="block truncate font-mono text-[12px] text-white/85" title={r.sourcePath}>
          {r.sourcePath}
        </code>
      ),
    },
    {
      key: "targetPath",
      header: t.table.target,
      className: "max-w-[18rem]",
      cell: (r) => (
        <code className="block truncate font-mono text-[12px] text-white/55" title={r.targetPath}>
          {r.targetPath}
        </code>
      ),
    },
    {
      key: "code",
      header: t.table.code,
      className: "whitespace-nowrap",
      cell: (r) => <Badge tone="neutral">{r.status}</Badge>,
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
      key: "origin",
      header: t.table.origin,
      className: "whitespace-nowrap",
      cell: (r) => (
        <Badge tone={r.origin === "MANUAL" ? "info" : "neutral"}>{t.originLabels[r.origin]}</Badge>
      ),
    },
    {
      key: "status",
      header: t.table.status,
      className: "whitespace-nowrap",
      cell: (r) => (
        <Badge tone={r.enabled ? "success" : "neutral"} dot>
          {r.enabled ? t.statusLabels.enabled : t.statusLabels.disabled}
        </Badge>
      ),
    },
    {
      key: "reason",
      header: t.table.reason,
      className: "max-w-[12rem]",
      cell: (r) => (
        <span className="block truncate text-white/45" title={r.notes ?? undefined}>
          {r.origin === "AUTOMATIC" ? t.reasonAuto : r.notes || t.reasonManual}
        </span>
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
          onClick={() => setDetailId(r.id)}
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
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => void load()}>
              {c.actions.refresh}
            </Button>
            <Button onClick={() => setCreating(true)}>{t.create}</Button>
          </div>
        }
      />

      {creating ? (
        <RedirectFormModal
          mode="create"
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}

      {detailId ? (
        <RedirectDetailModal
          redirectId={detailId}
          onClose={() => setDetailId(null)}
          onChanged={() => void load()}
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
              key: "origin",
              label: t.filters.origin,
              options: [
                { value: "AUTOMATIC", label: t.originLabels.AUTOMATIC },
                { value: "MANUAL", label: t.originLabels.MANUAL },
              ],
            },
            {
              kind: "select",
              key: "entityType",
              label: t.filters.entityType,
              options: (["PRODUCT", "CATEGORY", "BRAND", "OTHER"] as const).map((value) => ({
                value,
                label: t.entityLabels[value],
              })),
            },
            {
              kind: "select",
              key: "type",
              label: t.filters.type,
              options: REDIRECT_TYPES.map((value) => ({ value, label: t.typeLabels[value] })),
            },
            {
              kind: "select",
              key: "enabled",
              label: t.filters.status,
              options: [
                { value: "true", label: t.statusLabels.enabled },
                { value: "false", label: t.statusLabels.disabled },
              ],
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<RedirectFilters>)}
          onClearFilters={grid.clearFilters}
          activeFilterCount={grid.activeFilterCount}
          sortOptions={[
            { value: "createdAt:desc", label: t.sort.newest },
            { value: "createdAt:asc", label: t.sort.oldest },
            { value: "sourcePath:asc", label: t.sort.sourceAsc },
            { value: "sourcePath:desc", label: t.sort.sourceDesc },
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

/* ── Manuel yönlendirme oluştur / düzenle ─────────────────────────────────── */
function RedirectFormModal({
  mode,
  initial,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  initial?: AdminRedirectDetail;
  onClose: () => void;
  onSaved: () => void;
}) {
  const locale = useLocale();
  const t = seoDict(locale).redirects;
  const f = t.form;

  const [source, setSource] = useState(initial?.sourcePath ?? "");
  const [target, setTarget] = useState(initial?.targetPath ?? "");
  const [type, setType] = useState<RedirectTypeValue>((initial?.type as RedirectTypeValue) ?? "PERMANENT_301");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (source.trim().length === 0) return setError(f.sourceRequired);
    if (target.trim().length === 0) return setError(f.targetRequired);
    setSaving(true);
    try {
      if (mode === "create") {
        await storeApi.createRedirect({
          sourcePath: source.trim(),
          targetPath: target.trim(),
          type,
          notes: notes.trim() || undefined,
          enabled,
        });
      } else if (initial) {
        await storeApi.updateRedirect(initial.id, {
          sourcePath: source.trim(),
          targetPath: target.trim(),
          type,
          notes: notes.trim() ? notes.trim() : null,
          enabled,
        });
      }
      onSaved();
    } catch (err) {
      setError(messageForError(err, locale));
      setSaving(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={mode === "create" ? f.createTitle : f.editTitle}
      description={mode === "create" ? f.createDescription : undefined}
      closeLabel={f.cancel}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {f.cancel}
          </Button>
          <Button type="submit" form="redirect-form" disabled={saving}>
            {f.submit}
          </Button>
        </>
      }
    >
      <form id="redirect-form" onSubmit={onSubmit} className="space-y-3" noValidate>
        {error ? <Alert tone="error">{error}</Alert> : null}
        <Input
          id="rf-source"
          label={f.source}
          hint={f.sourceHint}
          value={source}
          onChange={(e) => setSource(e.target.value)}
          disabled={saving}
          required
        />
        <Input
          id="rf-target"
          label={f.target}
          hint={f.targetHint}
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          disabled={saving}
          required
        />
        <Select
          id="rf-type"
          label={f.type}
          value={type}
          onChange={(e) => setType(e.target.value as RedirectTypeValue)}
          disabled={saving}
          options={REDIRECT_TYPES.map((value) => ({ value, label: t.typeLabels[value] }))}
        />
        <Textarea
          id="rf-notes"
          label={f.notes}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={saving}
          rows={2}
        />
        <label className="flex items-center gap-2 text-sm text-white/80">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={saving}
          />
          {f.enabled}
        </label>
      </form>
    </Modal>
  );
}

/* ── Yönlendirme detayı (zincir + aksiyonlar) ─────────────────────────────── */
function RedirectDetailModal({
  redirectId,
  onClose,
  onChanged,
}: {
  redirectId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const locale = useLocale();
  const t = seoDict(locale).redirects;
  const d = t.detail;

  const [detail, setDetail] = useState<AdminRedirectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const res = await storeApi.getRedirect(redirectId);
      setDetail(res.data);
    } catch (err) {
      setError(messageForError(err, locale));
    }
  }, [redirectId, locale]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function toggleEnabled() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      await storeApi.updateRedirect(detail.id, { enabled: !detail.enabled });
      await reload();
      onChanged();
    } catch (err) {
      setError(messageForError(err, locale));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!detail) return;
    if (!window.confirm(d.deleteConfirm)) return;
    setBusy(true);
    setError(null);
    try {
      await storeApi.deleteRedirect(detail.id);
      onChanged();
      onClose();
    } catch (err) {
      setError(messageForError(err, locale));
      setBusy(false);
    }
  }

  if (editing && detail) {
    return (
      <RedirectFormModal
        mode="edit"
        initial={detail}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void reload();
          onChanged();
        }}
      />
    );
  }

  const isManual = detail?.origin === "MANUAL";

  return (
    <Modal
      open
      onClose={onClose}
      title={d.title}
      closeLabel={seoDict(locale).redirects.form.cancel}
      footer={
        detail ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="secondary" onClick={toggleEnabled} disabled={busy}>
              {detail.enabled ? d.disable : d.enable}
            </Button>
            {isManual ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setEditing(true)} disabled={busy}>
                  {d.edit}
                </Button>
                <Button variant="danger" onClick={remove} disabled={busy}>
                  {d.delete}
                </Button>
              </div>
            ) : null}
          </div>
        ) : null
      }
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!detail ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="space-y-4 text-sm">
          {detail.hasLoop ? <Alert tone="error">{d.loopWarning}</Alert> : null}

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-white/35">{d.chain}</p>
            <div className="flex flex-col gap-1 rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
              <code className="font-mono text-[12px] text-white/85">{detail.sourcePath}</code>
              <span className="text-white/30">↓ {detail.status}</span>
              <code className="font-mono text-[12px] text-white/60">{detail.targetPath}</code>
              {detail.resolvedTarget && detail.resolvedTarget !== detail.targetPath ? (
                <>
                  <span className="text-white/30">↓ ({detail.chainLength})</span>
                  <code className="font-mono text-[12px] text-emerald-300/80">{detail.resolvedTarget}</code>
                </>
              ) : null}
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-3">
            <Field label={t.table.origin} value={t.originLabels[detail.origin]} />
            <Field
              label={t.table.entityType}
              value={t.entityLabels[detail.entityType as keyof typeof t.entityLabels] ?? detail.entityType}
            />
            <Field label={d.resolvedTarget} value={detail.resolvedTarget ?? "—"} />
            <Field label={d.chainLength} value={format(d.chainHops, { count: detail.chainLength })} />
            <Field label={d.createdAt} value={formatDate(detail.createdAt)} />
            <Field label={d.updatedAt} value={formatDate(detail.updatedAt)} />
          </dl>

          <div>
            <p className="mb-1 text-xs uppercase tracking-wide text-white/35">{d.notes}</p>
            <p className="text-white/70">{detail.notes || d.noNotes}</p>
          </div>

          {!isManual ? <Alert tone="info">{d.automaticHint}</Alert> : null}
        </div>
      )}
    </Modal>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-white/35">{label}</dt>
      <dd className="truncate text-white/80" title={value}>
        {value}
      </dd>
    </div>
  );
}
