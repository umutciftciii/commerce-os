"use client";

/**
 * TODO-160 — Tüm influencer kampanyaları Data Grid'i (arama + durum filtresi).
 * "Yeni kampanya" modalı influencer'ı bir Select ile seçtirir (dizin listelenir);
 * satır düzenleme influencerId'yi değiştirmez. Para/oran bu ekranda yoktur.
 */

import Link from "next/link";
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
  InfluencerCampaignSummary,
  InfluencerCampaignStatus,
  InfluencerCampaignCreateRequest,
  InfluencerSummary,
} from "@commerce-os/api-client";
import { CampaignIcon } from "../../../components/icons";
import { storeApi } from "../../../lib/client/api";
import { messageForError } from "../../../lib/client/messages";
import { formatDate } from "../../../lib/client/format";
import { SurfaceCard } from "../../components/premium";

type Locale = "tr" | "en";
type Tone = "neutral" | "success" | "warning" | "info" | "danger";

const CAMPAIGN_TONES: Record<InfluencerCampaignStatus, Tone> = {
  ACTIVE: "success",
  PAUSED: "warning",
  ARCHIVED: "neutral",
};
const CAMPAIGN_STATUSES: readonly InfluencerCampaignStatus[] = ["ACTIVE", "PAUSED", "ARCHIVED"];

const L = {
  tr: {
    eyebrow: "Satış",
    title: "Influencer Kampanyaları",
    description:
      "Tüm influencer kampanyaları tek listede. Atıf penceresi kampanya bazında ayarlanır; atıf sunucu tarafında hesaplanır.",
    add: "Yeni kampanya",
    cardTitle: "Kampanya dizini",
    cardDescription: "Arama ve durum filtresiyle tüm kampanyalar.",
    loadError: "Kampanyalar yüklenemedi.",
    emptyTitle: "Henüz kampanya yok",
    emptyDescription: "Bir influencer seçip ilk kampanyayı oluşturun.",
    colName: "Kampanya",
    colInfluencer: "Influencer",
    colStatus: "Durum",
    colWindow: "Atıf (gün)",
    colLinks: "Link",
    colCreated: "Oluşturma",
    searchPlaceholder: "Kampanya ara…",
    filterStatus: "Durum",
    sortNewest: "En yeni",
    sortOldest: "En eski",
    sortName: "İsim (A-Z)",
    edit: "Düzenle",
    formTitleNew: "Yeni kampanya",
    formTitleEdit: "Kampanyayı düzenle",
    formInfluencer: "Influencer",
    formName: "Kampanya adı",
    formWindow: "Atıf penceresi (gün)",
    formStatus: "Durum",
    formStarts: "Başlangıç (opsiyonel)",
    formEnds: "Bitiş (opsiyonel)",
    save: "Kaydet",
    create: "Oluştur",
    close: "Kapat",
    validationInfluencer: "Influencer seçilmeli.",
    validationName: "Kampanya adı zorunludur.",
    noInfluencers: "Önce bir influencer oluşturun.",
    statusLabels: {
      ACTIVE: "Aktif",
      PAUSED: "Duraklatıldı",
      ARCHIVED: "Arşivlendi",
    } as Record<InfluencerCampaignStatus, string>,
  },
  en: {
    eyebrow: "Sales",
    title: "Influencer Campaigns",
    description:
      "All influencer campaigns in one list. Attribution window is per campaign; attribution is computed server-side.",
    add: "New campaign",
    cardTitle: "Campaign directory",
    cardDescription: "All campaigns with search and status filter.",
    loadError: "Could not load campaigns.",
    emptyTitle: "No campaigns yet",
    emptyDescription: "Pick an influencer and create the first campaign.",
    colName: "Campaign",
    colInfluencer: "Influencer",
    colStatus: "Status",
    colWindow: "Attr. (days)",
    colLinks: "Links",
    colCreated: "Created",
    searchPlaceholder: "Search campaigns…",
    filterStatus: "Status",
    sortNewest: "Newest",
    sortOldest: "Oldest",
    sortName: "Name (A-Z)",
    edit: "Edit",
    formTitleNew: "New campaign",
    formTitleEdit: "Edit campaign",
    formInfluencer: "Influencer",
    formName: "Campaign name",
    formWindow: "Attribution window (days)",
    formStatus: "Status",
    formStarts: "Starts at (optional)",
    formEnds: "Ends at (optional)",
    save: "Save",
    create: "Create",
    close: "Close",
    validationInfluencer: "An influencer must be selected.",
    validationName: "Campaign name is required.",
    noInfluencers: "Create an influencer first.",
    statusLabels: {
      ACTIVE: "Active",
      PAUSED: "Paused",
      ARCHIVED: "Archived",
    } as Record<InfluencerCampaignStatus, string>,
  },
} satisfies Record<Locale, unknown>;

type CampaignFilters = { status: string };

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; rows: InfluencerCampaignSummary[]; pagination: AdminListPagination };

function dateInputToIso(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function isoToDateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export default function InfluencerCampaignsPage() {
  return (
    <Suspense fallback={<SkeletonRows rows={5} />}>
      <InfluencerCampaignsView />
    </Suspense>
  );
}

function InfluencerCampaignsView() {
  const locale = useLocale() as Locale;
  const t = L[locale] ?? L.tr;
  const dict = getDictionary(locale);
  const c = dict.common;
  const g = dict.storeAdmin.dataGrid;

  const grid = useDataGridQuery<CampaignFilters>({
    basePath: "/influencer-campaigns",
    sortOptions: ["createdAt", "name", "status"],
    defaultSortBy: "createdAt",
    defaultSortOrder: "desc",
    filterKeys: ["status"],
  });

  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [editing, setEditing] = useState<InfluencerCampaignSummary | null>(null);
  const [creating, setCreating] = useState(false);

  const requestKey = JSON.stringify(grid.toRequestQuery());
  const requestQuery = useMemo(
    () => JSON.parse(requestKey) as Record<string, string | number>,
    [requestKey],
  );

  const load = useCallback(async () => {
    setState({ status: "loading" });
    try {
      const result = await storeApi.listInfluencerCampaigns(requestQuery);
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

  const columns: DataGridColumn<InfluencerCampaignSummary>[] = [
    {
      key: "name",
      sortable: true,
      header: t.colName,
      cell: (r) => <span className="font-medium text-white/90">{r.name}</span>,
    },
    {
      key: "influencer",
      header: t.colInfluencer,
      cell: (r) => (
        <Link
          href={`/influencers/${r.influencerId}`}
          className="text-white/70 underline-offset-2 hover:text-indigo-200 hover:underline"
        >
          {r.influencerName}
        </Link>
      ),
    },
    {
      key: "status",
      sortable: true,
      header: t.colStatus,
      cell: (r) => <Badge tone={CAMPAIGN_TONES[r.status]}>{t.statusLabels[r.status]}</Badge>,
    },
    {
      key: "attributionWindowDays",
      header: t.colWindow,
      align: "right",
      cell: (r) => <span className="tabular-nums text-white/70">{r.attributionWindowDays}</span>,
    },
    {
      key: "linkCount",
      header: t.colLinks,
      align: "right",
      cell: (r) => <span className="tabular-nums text-white/70">{r.linkCount}</span>,
    },
    {
      key: "createdAt",
      sortable: true,
      header: t.colCreated,
      cell: (r) => <span className="text-white/50">{formatDate(r.createdAt)}</span>,
    },
    {
      key: "action",
      header: "",
      align: "right",
      cell: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
          {t.edit}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={<Button onClick={() => setCreating(true)}>{t.add}</Button>}
      />

      {creating ? (
        <CampaignFormModal
          editing={null}
          t={t}
          locale={locale}
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            void load();
          }}
        />
      ) : null}

      {editing ? (
        <CampaignFormModal
          editing={editing}
          t={t}
          locale={locale}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      ) : null}

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
              options: CAMPAIGN_STATUSES.map((value) => ({
                value,
                label: t.statusLabels[value],
              })),
            },
          ]}
          values={grid.filters}
          onFiltersChange={(next) => grid.setFilters(next as Partial<CampaignFilters>)}
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

/* ── Kampanya oluştur/düzenle ───────────────────────────────────────────────── */
function CampaignFormModal({
  editing,
  t,
  locale,
  onClose,
  onSaved,
}: {
  editing: InfluencerCampaignSummary | null;
  t: (typeof L)[Locale];
  locale: Locale;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [influencers, setInfluencers] = useState<InfluencerSummary[] | null>(null);
  const [influencerId, setInfluencerId] = useState(editing?.influencerId ?? "");
  const [name, setName] = useState(editing?.name ?? "");
  const [status, setStatus] = useState<InfluencerCampaignStatus>(editing?.status ?? "ACTIVE");
  const [windowDays, setWindowDays] = useState(
    editing ? String(editing.attributionWindowDays) : "30",
  );
  const [startsAt, setStartsAt] = useState(isoToDateInput(editing?.startsAt ?? null));
  const [endsAt, setEndsAt] = useState(isoToDateInput(editing?.endsAt ?? null));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Influencer seçici için dizini yükle (yalnız oluşturmada gerekir).
  useEffect(() => {
    if (editing) return;
    let alive = true;
    void (async () => {
      try {
        const result = await storeApi.listInfluencers({ pageSize: 100, sortBy: "name", sortOrder: "asc" });
        if (!alive) return;
        setInfluencers(result.data);
        setInfluencerId((prev) => prev || result.data[0]?.id || "");
      } catch {
        if (alive) setInfluencers([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [editing]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!editing && !influencerId) {
      setError(t.validationInfluencer);
      return;
    }
    if (!name.trim()) {
      setError(t.validationName);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const attributionWindowDays = Number.parseInt(windowDays, 10) || 30;
      if (editing) {
        await storeApi.updateInfluencerCampaign(editing.id, {
          name: name.trim(),
          status,
          attributionWindowDays,
          startsAt: dateInputToIso(startsAt),
          endsAt: dateInputToIso(endsAt),
        });
      } else {
        const payload: InfluencerCampaignCreateRequest = {
          influencerId,
          name: name.trim(),
          status,
          attributionWindowDays,
          startsAt: dateInputToIso(startsAt),
          endsAt: dateInputToIso(endsAt),
        };
        await storeApi.createInfluencerCampaign(payload);
      }
      onSaved();
    } catch (cause) {
      setError(messageForError(cause, locale));
      setBusy(false);
    }
  };

  const noInfluencers = !editing && influencers !== null && influencers.length === 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? t.formTitleEdit : t.formTitleNew}
      closeLabel={t.close}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t.close}
          </Button>
          <Button onClick={() => void submit()} disabled={busy || noInfluencers}>
            {editing ? t.save : t.create}
          </Button>
        </div>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {error ? <Alert tone="error">{error}</Alert> : null}
        {noInfluencers ? <Alert tone="warning">{t.noInfluencers}</Alert> : null}

        {editing ? (
          <p className="text-sm text-white/60">
            {t.formInfluencer}: <span className="font-medium text-white/85">{editing.influencerName}</span>
          </p>
        ) : (
          <Select
            label={t.formInfluencer}
            value={influencerId}
            onChange={(e) => setInfluencerId(e.target.value)}
            options={(influencers ?? []).map((influencer) => ({
              value: influencer.id,
              label: `${influencer.name} (${influencer.code})`,
            }))}
          />
        )}

        <Input label={t.formName} value={name} onChange={(e) => setName(e.target.value)} required />

        <div className="grid gap-3 md:grid-cols-2">
          <Input
            label={t.formWindow}
            type="number"
            inputMode="numeric"
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
          />
          <Select
            label={t.formStatus}
            value={status}
            onChange={(e) => setStatus(e.target.value as InfluencerCampaignStatus)}
            options={CAMPAIGN_STATUSES.map((value) => ({ value, label: t.statusLabels[value] }))}
          />
          <Input
            label={t.formStarts}
            type="date"
            value={startsAt}
            onChange={(e) => setStartsAt(e.target.value)}
          />
          <Input
            label={t.formEnds}
            type="date"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
          />
        </div>
      </form>
    </Modal>
  );
}
